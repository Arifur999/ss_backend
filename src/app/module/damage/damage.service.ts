import status from "http-status";
import { Prisma } from "../../../generated/prisma/client.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { roundTaka } from "../../shared/money.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, type IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { nextDamageStatus, returnsStock } from "../../shared/damageStatus.js";
import { adjustInventoryLevel, drawStockFifo, releaseDamageCostLayers, returnStockBatch } from "../inventory/fifo.helpers.js";
import {
    ICreateDamagePayload,
    IDamageTransactionPayload,
    IReceiveDamageItemPayload,
    IUpdateDamagePayload,
} from "./damage.validation.js";

type Tx = Prisma.TransactionClient;

// Shaped to match what the frontend's supabase shim expects from a nested
// select, exactly as purchaseInclude does.
const damageInclude = {
    damage_items: { include: { damage_receives: true } },
} as const;

/**
 * A document number nobody has used yet.
 *
 * The same collision loop as purchase's resolveSiNo: two operators saving at
 * the same second would otherwise hit the (owner_id, doc_no) unique index and
 * one of them would lose a form they had just filled in. Appending -1, -2 and
 * saving is kinder than a 409 telling them to try again.
 */
const resolveDocNo = async (tx: Tx, ownerId: string, requested?: string) => {
    const base = (requested || "").trim() || `DMG-${Date.now()}`;
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? base : `${base}-${attempt}`;
        const clash = await tx.damageEntry.findFirst({
            where: { owner_id: ownerId, doc_no: candidate },
            select: { id: true },
        });
        if (!clash) return candidate;
    }
    throw new AppError(status.CONFLICT, "Could not allocate a document number");
};

/**
 * The categories Damage files its own money under, created on first use.
 *
 * The owner never has to set these up before recording a breakage, and once
 * they exist they behave like any other category - renameable, reportable, and
 * counted by deleteCategory so one still in use cannot be removed.
 */
const DAMAGE_LOSS_CATEGORY = "Damage Loss";
const DAMAGE_REPAIR_CATEGORY = "Damage Repair";

const resolveDamageCategory = async (tx: Tx, ownerId: string, name: string) => {
    const existing = await tx.expenseCategory.findFirst({ where: { owner_id: ownerId, name } });
    if (existing) return existing;
    return tx.expenseCategory.create({ data: { owner_id: ownerId, name } });
};

/** Recompute an entry's status from its lines. The rule lives in shared/damageStatus. */
const refreshDamageStatus = async (tx: Tx, damageEntryId: string) => {
    const lines = await tx.damageItem.findMany({
        where: { damage_entry_id: damageEntryId },
        select: { qty: true, received_qty: true },
    });
    await tx.damageEntry.update({
        where: { id: damageEntryId },
        data: { status: nextDamageStatus(lines) },
    });
};

const getAllDamageEntries = async (user: IRequestUser, statuses?: string[], options?: ListOptions) => {
    return prisma.damageEntry.findMany({
        where: {
            owner_id: user.ownerId,
            deleted_at: null,
            ...(statuses?.length ? { status: { in: statuses as never } } : {}),
            ...(options ? dateRangeWhere(options) : {}),
        },
        include: damageInclude,
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

/**
 * Record damage, and take the goods off the shelf.
 *
 * Stock moves at entry, not at receive: the owner's rule is that the book
 * stock must match the godown, and the moment a chair is broken it is not
 * sellable. Each line's cost is drawn FIFO and stored, which is the whole
 * point of the module - the manual stock adjustment this replaces knew how
 * many pieces left but never what they were worth.
 */
const createDamageEntry = async (payload: ICreateDamagePayload, user: IRequestUser) => {
    const { items, ...entryData } = payload;

    await assertOwnedReferences(entryData, user.ownerId, { supplier_id: "supplier" });

    const productIds = [...new Set(items.map((item) => item.product_id))];
    const owned = await prisma.product.count({
        where: { id: { in: productIds }, owner_id: user.ownerId },
    });
    if (owned !== productIds.length) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    return prisma.$transaction(async (tx) => {
        const entry = await tx.damageEntry.create({
            data: {
                owner_id: user.ownerId,
                doc_no: await resolveDocNo(tx, user.ownerId, entryData.doc_no),
                date: new Date(entryData.date),
                source: entryData.source ?? "own_stock",
                action: entryData.action ?? "repair",
                supplier_id: entryData.supplier_id ?? null,
                supplier_name: entryData.supplier_name ?? "",
                notes: entryData.notes ?? "",
                created_by: user.userId,
            },
        });

        for (const item of items) {
            // What the goods cost, taken off the batches oldest-first. A
            // shortfall is not an error here - stock is allowed to go negative.
            const draw = await drawStockFifo(tx, { productId: item.product_id, qty: item.qty }, user);

            // A stated price wins over the drawn one, and is the only figure
            // available when the draw came up empty - a piece damaged that the
            // batch table has no record of. The LAYERS below still record what
            // actually came off each batch, because they are what a delete
            // gives back; this is the valuation, and the two are allowed to
            // differ when the owner says so.
            const stated = roundTaka(item.unit_cost);
            const unitCost = stated > 0 ? stated : draw.unitCost;
            const totalCost = stated > 0 ? roundTaka(stated * item.qty) : draw.totalCost;

            const line = await tx.damageItem.create({
                data: {
                    owner_id: user.ownerId,
                    damage_entry_id: entry.id,
                    product_id: item.product_id,
                    product_code: item.product_code ?? "",
                    product_name: item.product_name,
                    qty: item.qty,
                    unit_cost: unitCost,
                    total_cost: totalCost,
                },
            });

            // Which batches it came off, so deleting the entry can put it back
            // on exactly those and not merely restore the total.
            for (const take of draw.takes) {
                await tx.damageCostLayer.create({
                    data: {
                        owner_id: user.ownerId,
                        damage_item_id: line.id,
                        inventory_batch_id: take.batchId,
                        qty: take.qty,
                        dp_price: take.dpPrice,
                        cost_amount: take.qty * take.dpPrice,
                    },
                });
            }

            // The part no batch could supply, kept as a layer with no batch so
            // the line's layers still add up to its quantity.
            if (draw.shortfall > 0) {
                await tx.damageCostLayer.create({
                    data: {
                        owner_id: user.ownerId,
                        damage_item_id: line.id,
                        inventory_batch_id: null,
                        qty: draw.shortfall,
                        dp_price: draw.unitCost,
                        cost_amount: draw.shortfall * draw.unitCost,
                    },
                });
            }

            await adjustInventoryLevel(
                tx,
                {
                    productId: item.product_id,
                    productName: item.product_name,
                    qtyChange: -item.qty,
                    changeType: "adjustment",
                    referenceId: entry.id,
                    referenceType: "damage_out",
                    notes: `Damaged - ${entry.doc_no}`,
                },
                user
            );
        }

        await refreshDamageStatus(tx, entry.id);

        return tx.damageEntry.findUnique({ where: { id: entry.id }, include: damageInclude });
    });
};

const updateDamageEntry = async (id: string, payload: IUpdateDamagePayload, user: IRequestUser) => {
    const existing = await prisma.damageEntry.findFirst({
        where: { id, owner_id: user.ownerId, deleted_at: null },
    });
    if (!existing) throw new AppError(status.NOT_FOUND, "Damage entry not found");

    await assertOwnedReferences(payload, user.ownerId, { supplier_id: "supplier" });

    // Paperwork only. Quantities and products are not editable here on purpose:
    // changing them would have to unwind stock that has already moved and
    // possibly already come back, and there is a delete-and-re-enter path for
    // that which is easier to reason about than a half-reversal.
    return prisma.damageEntry.update({
        where: { id },
        data: {
            ...(payload.doc_no !== undefined ? { doc_no: payload.doc_no } : {}),
            ...(payload.date !== undefined ? { date: new Date(payload.date) } : {}),
            ...(payload.source !== undefined ? { source: payload.source } : {}),
            ...(payload.action !== undefined ? { action: payload.action } : {}),
            ...(payload.supplier_id !== undefined ? { supplier_id: payload.supplier_id } : {}),
            ...(payload.supplier_name !== undefined ? { supplier_name: payload.supplier_name } : {}),
            ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        },
        include: damageInclude,
    });
};

/**
 * Take a line's goods back, or write them off.
 *
 * `repaired` and `replaced` put the stock back at the cost it left with, in a
 * batch of its own so FIFO has something to sell. `scrapped` puts nothing
 * back - see returnsStock.
 */
const receiveDamageItem = async (
    entryId: string,
    payload: IReceiveDamageItemPayload,
    user: IRequestUser
) => {
    const entry = await prisma.damageEntry.findFirst({
        where: { id: entryId, owner_id: user.ownerId, deleted_at: null },
    });
    if (!entry) throw new AppError(status.NOT_FOUND, "Damage entry not found");

    const item = await prisma.damageItem.findFirst({
        where: { id: payload.damage_item_id, damage_entry_id: entryId, owner_id: user.ownerId },
        include: { product: { select: { selling_price: true, name: true } } },
    });
    if (!item) throw new AppError(status.NOT_FOUND, "Damage item not found");

    const outstanding = item.qty - item.received_qty;
    if (payload.received_qty > outstanding) {
        throw new AppError(
            status.BAD_REQUEST,
            `Only ${outstanding} still to come back on this line`
        );
    }

    return prisma.$transaction(async (tx) => {
        await tx.damageReceive.create({
            data: {
                owner_id: user.ownerId,
                damage_entry_id: entryId,
                damage_item_id: item.id,
                receive_date: new Date(payload.receive_date),
                receiver_name: payload.receiver_name ?? "",
                received_qty: payload.received_qty,
                result: payload.result,
                notes: payload.notes ?? "",
                created_by: user.userId,
            },
        });

        await tx.damageItem.update({
            where: { id: item.id },
            data: { received_qty: item.received_qty + payload.received_qty },
        });

        if (returnsStock(payload.result) && item.product_id) {
            await returnStockBatch(
                tx,
                {
                    productId: item.product_id,
                    qty: payload.received_qty,
                    // The cost it left with. A repair does not change what the
                    // goods cost - that is its own expense, booked separately.
                    dpPrice: Number(item.unit_cost),
                    mrpPrice: Number(item.product?.selling_price ?? 0),
                    receivedDate: new Date(payload.receive_date),
                },
                user
            );

            await adjustInventoryLevel(
                tx,
                {
                    productId: item.product_id,
                    productName: item.product_name,
                    qtyChange: payload.received_qty,
                    changeType: "adjustment",
                    referenceId: entryId,
                    referenceType: "damage_in",
                    notes: `${payload.result === "replaced" ? "Replaced" : "Repaired"} - ${entry.doc_no}`,
                },
                user
            );
        }

        // A scrapped piece is the moment the goods stop being an asset in
        // repair and become a loss. Booked here rather than at entry, because
        // a chair away at the carpenter's is not lost yet and booking then
        // reversing is how books get muddled.
        if (payload.result === "scrapped") {
            const category = await resolveDamageCategory(tx, user.ownerId, DAMAGE_LOSS_CATEGORY);
            await tx.expense.create({
                data: {
                    owner_id: user.ownerId,
                    date: new Date(payload.receive_date),
                    category_id: category.id,
                    category_name: category.name,
                    amount: payload.received_qty * Number(item.unit_cost),
                    // No cash left the till - the GOODS did. A null account
                    // reaches the P&L and never the Balance Dashboard, the same
                    // rule "discount allowed" runs on.
                    account_id: null,
                    account_name: "",
                    damage_entry_id: entryId,
                    notes: `Written off - ${entry.doc_no} - ${item.product_name}`,
                    created_by: user.userId,
                },
            });
        }

        await refreshDamageStatus(tx, entryId);

        return tx.damageEntry.findUnique({ where: { id: entryId }, include: damageInclude });
    });
};

/**
 * Money against an entry: a repair paid out, or a refund received.
 *
 * Both are written into the tables the rest of the app already reads -
 * expenses and other_incomes - rather than a table of Damage's own, so the
 * Balance Dashboard, the P&L, the reports and the Account Ledger are right
 * without any of them being touched. The damage_entry_id is what lets the
 * Transactions page find them again.
 */
const addDamageTransaction = async (
    entryId: string,
    payload: IDamageTransactionPayload,
    user: IRequestUser
) => {
    const entry = await prisma.damageEntry.findFirst({
        where: { id: entryId, owner_id: user.ownerId, deleted_at: null },
    });
    if (!entry) throw new AppError(status.NOT_FOUND, "Damage entry not found");

    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        category_id: "expenseCategory",
    });

    if (payload.kind === "supplier_refund") {
        return prisma.otherIncome.create({
            data: {
                owner_id: user.ownerId,
                date: new Date(payload.date),
                income_type: entry.supplier_id ? "supplier" : "other",
                supplier_id: entry.supplier_id,
                supplier_name: entry.supplier_name,
                source_name: `Damage refund - ${entry.doc_no}`,
                amount: payload.amount,
                account_id: payload.account_id,
                account_name: payload.account_name ?? "",
                damage_entry_id: entryId,
                notes: payload.notes ?? "",
                created_by: user.userId,
            },
        });
    }

    return prisma.$transaction(async (tx) => {
        const category = payload.category_id
            ? { id: payload.category_id, name: payload.category_name ?? "" }
            : await resolveDamageCategory(tx, user.ownerId, DAMAGE_REPAIR_CATEGORY);

        return tx.expense.create({
            data: {
                owner_id: user.ownerId,
                date: new Date(payload.date),
                category_id: category.id,
                category_name: category.name,
                amount: payload.amount,
                account_id: payload.account_id,
                account_name: payload.account_name ?? "",
                damage_entry_id: entryId,
                notes: payload.notes ?? `Repair - ${entry.doc_no}`,
                created_by: user.userId,
            },
        });
    });
};

/** Everything booked against an entry, both directions, newest first. */
const getDamageTransactions = async (user: IRequestUser) => {
    const [expenses, incomes] = await Promise.all([
        prisma.expense.findMany({
            where: { owner_id: user.ownerId, deleted_at: null, damage_entry_id: { not: null } },
            orderBy: [{ date: "desc" }, { created_at: "desc" }],
        }),
        prisma.otherIncome.findMany({
            where: { owner_id: user.ownerId, damage_entry_id: { not: null } },
            orderBy: [{ date: "desc" }, { created_at: "desc" }],
        }),
    ]);

    return { expenses, other_incomes: incomes };
};

/**
 * Delete an entry and put back exactly what it took.
 *
 * Refused once anything has been received against it, the way purchase refuses
 * to delete a receive whose batch has been sold. A receive puts stock back as
 * a NEW batch, and nothing links that batch to the entry - so undoing it would
 * mean guessing which batch to remove, and guessing in a costing path is how a
 * figure stops being trustworthy. Delete the receives first, or leave the entry
 * standing.
 *
 * With no receives the reversal is exact: each line's cost layers hand the
 * quantity back to the very batches it came off, and the inventory level moves
 * by the same amount.
 */
const deleteDamageEntry = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.damageEntry.findFirst({
        where: { id, owner_id: user.ownerId, deleted_at: null },
        include: damageInclude,
    });
    if (!existing) throw new AppError(status.NOT_FOUND, "Damage entry not found");

    const received = existing.damage_items.reduce((sum, item) => sum + item.received_qty, 0);
    if (received > 0) {
        throw new AppError(
            status.CONFLICT,
            `${received} item(s) have already been received against this entry. Delete those receives first.`
        );
    }

    return prisma.$transaction(async (tx) => {
        for (const item of existing.damage_items) {
            await releaseDamageCostLayers(tx, item.id);

            if (!item.product_id) continue;
            await adjustInventoryLevel(
                tx,
                {
                    productId: item.product_id,
                    productName: item.product_name,
                    qtyChange: item.qty,
                    changeType: "adjustment",
                    referenceId: id,
                    referenceType: "damage_delete",
                    notes: `Damage entry ${existing.doc_no} deleted`,
                },
                user
            );
        }

        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "damage_entries",
                row: existing,
                meta: recycleMeta,
                fallbackType: "damage",
                fallbackTitle: existing.doc_no,
                fallbackSubtitle: existing.supplier_name,
                fallbackAmount: existing.damage_items.reduce((sum, item) => sum + Number(item.total_cost), 0),
            }),
        });

        // Items and receives cascade.
        await tx.damageEntry.delete({ where: { id } });
        return { id };
    });
};

export const DamageService = {
    getAllDamageEntries,
    createDamageEntry,
    updateDamageEntry,
    receiveDamageItem,
    deleteDamageEntry,
    addDamageTransaction,
    getDamageTransactions,
};
