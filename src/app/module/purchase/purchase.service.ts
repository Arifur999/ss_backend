import status from "http-status";
import { Prisma } from "../../../generated/prisma/client.js";
import { ShippingStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { createReceiveStockBatch } from "../inventory/fifo.helpers.js";
import { purchaseReceiveCost } from "../../shared/batchCost.js";
import { memoPrefix, nextMemoNo } from "../../shared/receiveMemoNo.js";
import { ICreatePurchasePayload, IReceivePurchaseItemPayload, IUpdatePurchasePayload, IAddPurchaseItemPayload } from "./purchase.validation.js";

// Supabase nested selects returned relations under their table names:
// purchases.purchase_items[].purchase_receives[] - keep that shape.
const purchaseInclude = {
    purchase_items: { include: { purchase_receives: true } },
} as const;

const getAllPurchases = async (user: IRequestUser, statuses?: string[], options: ListOptions = {}) => {
    return prisma.purchase.findMany({
        where: {
            owner_id: user.ownerId,
            deleted_at: null,
            ...dateRangeWhere(options),
            ...(statuses && statuses.length > 0
                ? { shipping_status: { in: statuses as ShippingStatus[] } }
                : {}),
        },
        include: purchaseInclude,
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

/**
 * The requested SI number, or the next free one after it.
 *
 * Mirrors resolveInvoiceNo on the sale side, and for the same reason. The client
 * generates these as PO-YYMM plus four random digits - 9,000 slots a month, so by
 * the birthday bound a workspace placing ~150 orders in a month has better than a
 * 70% chance of at least one collision.
 *
 * The sale side already survived that by suffixing. The purchase side threw a 409
 * instead, and PurchaseOrders seeds si_no into form state once and only
 * regenerates it AFTER a successful save - so the retry resubmitted the identical
 * colliding number and failed again until somebody edited the field by hand.
 *
 * Suffixing is invisible in the normal case: it only appears when the number was
 * genuinely taken, and then the operator sees PO-2608-1234-1 rather than an error.
 */
const resolveSiNo = async (tx: Prisma.TransactionClient, ownerId: string, requested: string) => {
    let candidate = requested;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const existing = await tx.purchase.findUnique({
            where: { owner_id_si_no: { owner_id: ownerId, si_no: candidate } },
            select: { id: true },
        });
        if (!existing) return candidate;
        candidate = `${requested}-${attempt + 1}`;
    }
    return `${requested}-${Date.now()}`;
};

const createPurchase = async (payload: ICreatePurchasePayload, user: IRequestUser) => {
    const { items, ...purchaseData } = payload;

    // The supplier and every product referenced have to belong to this workspace.
    // Nothing checked either before: posting another owner's supplier_id accrued
    // this purchase against their supplier, and superAdmin's supplier cleanup then
    // cascaded across workspaces. Products are checked as one count rather than
    // per item so a bad line fails the whole save before anything is written.
    await assertOwnedReferences(purchaseData, user.ownerId, { supplier_id: "supplier" });

    const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))] as string[];
    if (productIds.length > 0) {
        const owned = await prisma.product.count({
            where: { id: { in: productIds }, owner_id: user.ownerId },
        });
        if (owned !== productIds.length) {
            throw new AppError(status.NOT_FOUND, "Product not found");
        }
    }

    return prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
            data: {
                ...purchaseData,
                si_no: await resolveSiNo(tx, user.ownerId, purchaseData.si_no),
                date: new Date(purchaseData.date),
                owner_id: user.ownerId,
                created_by: user.userId,
            },
        });

        await tx.purchaseItem.createMany({
            data: items.map((item) => ({
                ...item,
                owner_id: user.ownerId,
                purchase_id: purchase.id,
                received_qty: item.received_qty ?? 0,
            })),
        });

        return tx.purchase.findUniqueOrThrow({
            where: { id: purchase.id },
            include: purchaseInclude,
        });
    });
};

const updatePurchase = async (id: string, payload: IUpdatePurchasePayload, user: IRequestUser) => {
    const existing = await prisma.purchase.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Purchase not found");
    }

    return prisma.purchase.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
        include: purchaseInclude,
    });
};

/** Recalculate a purchase's shipping status from the state of all its items. */
const refreshShippingStatus = async (tx: Prisma.TransactionClient, purchaseId: string) => {
    const allItems = await tx.purchaseItem.findMany({
        where: { purchase_id: purchaseId },
        select: { qty: true, received_qty: true },
    });
    const allReceived = allItems.every((row) => row.received_qty >= row.qty);
    const someReceived = allItems.some((row) => row.received_qty > 0);

    return tx.purchase.update({
        where: { id: purchaseId },
        data: {
            shipping_status: allReceived
                ? ShippingStatus.received
                : someReceived
                    ? ShippingStatus.partial
                    : ShippingStatus.pending,
        },
        include: purchaseInclude,
    });
};

type ReceivableItem = {
    id: string;
    product_id: string | null;
    product_name: string;
    received_qty: number;
    actual_dp: Prisma.Decimal | number;
    dp_price: Prisma.Decimal | number;
    // Named here because purchaseReceiveCost needs it whenever actual_dp was
    // left at its 0 default. Both callers load the whole row, so it arrives
    // either way - but a type that omitted it let the batch fall back to the
    // list price with nothing to flag it, which is the bug this replaced.
    discount_pct: Prisma.Decimal | number;
    product?: { selling_price: Prisma.Decimal | number } | null;
};

/**
 * Receiving one line, inside a caller-supplied transaction.
 *
 * The old client-side saveReceive flow (6 separate requests) as one unit: receive
 * row -> item received_qty -> inventory level -> FIFO batch (+preorder
 * settlement) -> inventory history. The status refresh is the caller's job, so
 * receiving several lines can do it once at the end.
 */
const receiveItemInTx = async (
    tx: Prisma.TransactionClient,
    purchase: { id: string; si_no: string },
    item: ReceivableItem,
    payload: { receive_date: string; receiver_name?: string; received_qty: number; condition?: IReceivePurchaseItemPayload["condition"]; notes?: string; memo_id?: string },
    user: IRequestUser
) => {
    const receiveRow = await tx.purchaseReceive.create({
        data: {
            owner_id: user.ownerId,
            purchase_id: purchase.id,
            purchase_item_id: item.id,
            receive_date: new Date(payload.receive_date),
            receiver_name: payload.receiver_name ?? "",
            received_qty: payload.received_qty,
            condition: payload.condition,
            notes: payload.notes ?? "",
            memo_id: payload.memo_id ?? null,
            created_by: user.userId,
        },
    });

    await tx.purchaseItem.update({
        where: { id: item.id },
        data: { received_qty: item.received_qty + payload.received_qty },
    });

    const inventory = await tx.inventory.findUnique({
        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: item.product_id! } },
    });

    if (inventory) {
        await tx.inventory.update({
            where: { id: inventory.id },
            data: {
                available_qty: inventory.available_qty + payload.received_qty,
                upcoming_qty: Math.max(0, inventory.upcoming_qty - payload.received_qty),
            },
        });
    } else {
        await tx.inventory.create({
            data: {
                owner_id: user.ownerId,
                product_id: item.product_id!,
                available_qty: payload.received_qty,
                upcoming_qty: 0,
            },
        });
    }

    await createReceiveStockBatch(
        tx,
        {
            productId: item.product_id!,
            purchaseItemId: item.id,
            purchaseReceiveId: receiveRow.id,
            qty: payload.received_qty,
            // Not `actual_dp || dp_price`. actual_dp is optional in the Zod
            // schema and defaults to 0, so an item saved without it fell back
            // to the LIST price - and every sale costed against this batch then
            // reported goods bought at Tk 10,260 as costing Tk 11,400, which is
            // the same mistake opening stock used to make. purchaseReceiveCost
            // derives the figure from dp_price and discount_pct instead.
            dpPrice: purchaseReceiveCost(item),
            mrpPrice: Number(item.product?.selling_price ?? 0),
            receiveDate: new Date(payload.receive_date),
        },
        user
    );

    await tx.inventoryHistory.create({
        data: {
            owner_id: user.ownerId,
            product_id: item.product_id!,
            product_name: item.product_name,
            change_type: "purchase_in",
            qty_change: payload.received_qty,
            qty_before: inventory?.available_qty ?? 0,
            qty_after: (inventory?.available_qty ?? 0) + payload.received_qty,
            reference_id: purchase.id,
            reference_type: "purchase",
            notes: `Received from purchase ${purchase.si_no}`,
            created_by: user.userId,
        },
    });
};

/**
 * Receive every outstanding line on a purchase, in one transaction.
 *
 * The Purchase Orders page offered "save and receive into stock" by creating the
 * purchase and then looping receivePurchaseItem once per line. A failure on item
 * 3 of 5 left items 1-2 in stock and 3-5 not, and the error carried no indication
 * of which had landed - so the operator could not tell what to do next without
 * reading the ledger line by line.
 *
 * One call, one transaction: either the whole order is in stock or none of it is.
 */
const receiveAllPurchaseItems = async (
    purchaseId: string,
    payload: { receive_date: string; receiver_name?: string; notes?: string },
    user: IRequestUser
) => {
    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, owner_id: user.ownerId },
        include: {
            purchase_items: { include: { product: { select: { selling_price: true } } } },
        },
    });

    if (!purchase) {
        throw new AppError(status.NOT_FOUND, "Purchase not found");
    }

    // Only what is still outstanding, so calling this twice is not a double
    // receive - the second call finds nothing left and only refreshes the status.
    const outstanding = purchase.purchase_items
        .filter((item) => item.product_id && item.qty > item.received_qty)
        .map((item) => ({ item, qty: item.qty - item.received_qty }));

    return prisma.$transaction(async (tx) => {
        for (const { item, qty } of outstanding) {
            await receiveItemInTx(
                tx,
                purchase,
                item,
                {
                    receive_date: payload.receive_date,
                    receiver_name: payload.receiver_name,
                    received_qty: qty,
                    condition: "good",
                    notes: payload.notes ?? "Received on order creation",
                },
                user
            );
        }

        return refreshShippingStatus(tx, purchaseId);
    });
};

const receivePurchaseItem = async (
    purchaseId: string,
    payload: IReceivePurchaseItemPayload,
    user: IRequestUser
) => {
    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, owner_id: user.ownerId },
    });

    if (!purchase) {
        throw new AppError(status.NOT_FOUND, "Purchase not found");
    }

    const item = await prisma.purchaseItem.findFirst({
        where: { id: payload.purchase_item_id, purchase_id: purchaseId, owner_id: user.ownerId },
        include: { product: { select: { selling_price: true, name: true } } },
    });

    if (!item || !item.product_id) {
        throw new AppError(status.NOT_FOUND, "Purchase item not found");
    }

    return prisma.$transaction(async (tx) => {
        await receiveItemInTx(tx, purchase, item, payload, user);
        return refreshShippingStatus(tx, purchaseId);
    });
};


// Edit a receive's quantity: adjusts the receive row, item received_qty,
// inventory level, the linked FIFO batch, and the purchase status.
const updateReceive = async (receiveId: string, newQty: number, user: IRequestUser) => {
    const receive = await prisma.purchaseReceive.findFirst({
        where: { id: receiveId, owner_id: user.ownerId },
        include: { purchase_item: true },
    });

    if (!receive) {
        throw new AppError(status.NOT_FOUND, "Receive record not found");
    }

    const delta = newQty - receive.received_qty;
    if (delta === 0) {
        return prisma.purchase.findUniqueOrThrow({
            where: { id: receive.purchase_id },
            include: purchaseInclude,
        });
    }

    const productId = receive.purchase_item.product_id;

    return prisma.$transaction(async (tx) => {
        await tx.purchaseReceive.update({
            where: { id: receiveId },
            data: { received_qty: newQty },
        });

        await tx.purchaseItem.update({
            where: { id: receive.purchase_item_id },
            data: { received_qty: { increment: delta } },
        });

        if (productId) {
            await tx.inventory.updateMany({
                where: { owner_id: user.ownerId, product_id: productId },
                data: { available_qty: { increment: delta } },
            });

            const batch = await tx.inventoryBatch.findFirst({
                where: { purchase_receive_id: receiveId },
            });
            if (batch) {
                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: {
                        received_qty: Math.max(0, batch.received_qty + delta),
                        remaining_qty: Math.max(0, batch.remaining_qty + delta),
                    },
                });
            }

            await tx.inventoryHistory.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: productId,
                    product_name: receive.purchase_item.product_name,
                    change_type: "adjustment",
                    qty_change: delta,
                    reference_id: receive.purchase_id,
                    reference_type: "purchase_receive_edit",
                    notes: "Receive quantity edited",
                    created_by: user.userId,
                },
            });
        }

        const allItems = await tx.purchaseItem.findMany({
            where: { purchase_id: receive.purchase_id },
            select: { qty: true, received_qty: true },
        });
        const allReceived = allItems.every((row) => row.received_qty >= row.qty);
        const someReceived = allItems.some((row) => row.received_qty > 0);

        return tx.purchase.update({
            where: { id: receive.purchase_id },
            data: {
                shipping_status: allReceived
                    ? ShippingStatus.received
                    : someReceived
                        ? ShippingStatus.partial
                        : ShippingStatus.pending,
            },
            include: purchaseInclude,
        });
    });
};

// Edit a purchase item's descriptive/pricing fields (Purchase Ledger edit).
// Quantities received/stock are managed by the receive endpoints, not here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updatePurchaseItem = async (itemId: string, payload: Record<string, any>, user: IRequestUser) => {
    const item = await prisma.purchaseItem.findFirst({
        where: { id: itemId, owner_id: user.ownerId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Purchase item not found");
    }

    const allowedFields = [
        "product_code", "product_name", "dp_price", "discount_pct",
        "actual_dp", "qty", "total_amount", "sp_pct", "sp_amount",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    for (const field of allowedFields) {
        if (field in payload) data[field] = payload[field];
    }

    return prisma.purchaseItem.update({
        where: { id: itemId },
        data,
    });
};

// Set a purchase item's total received qty directly (old edit-receive UI):
// applies the delta to inventory + the latest FIFO batch, refreshes status.
const setItemReceivedQty = async (itemId: string, newQty: number, user: IRequestUser) => {
    const item = await prisma.purchaseItem.findFirst({
        where: { id: itemId, owner_id: user.ownerId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Purchase item not found");
    }

    const delta = newQty - item.received_qty;

    return prisma.$transaction(async (tx) => {
        await tx.purchaseItem.update({
            where: { id: itemId },
            data: { received_qty: newQty },
        });

        if (delta !== 0 && item.product_id) {
            await tx.inventory.upsert({
                where: { owner_id_product_id: { owner_id: user.ownerId, product_id: item.product_id } },
                create: {
                    owner_id: user.ownerId,
                    product_id: item.product_id,
                    available_qty: delta,
                    upcoming_qty: 0,
                },
                update: { available_qty: { increment: delta } },
            });

            const batch = await tx.inventoryBatch.findFirst({
                where: { purchase_item_id: itemId },
                orderBy: { created_at: "desc" },
            });
            if (batch) {
                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: {
                        received_qty: Math.max(0, batch.received_qty + delta),
                        remaining_qty: Math.max(0, batch.remaining_qty + delta),
                    },
                });
            }

            await tx.inventoryHistory.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    change_type: "adjustment",
                    qty_change: delta,
                    reference_id: item.purchase_id,
                    reference_type: "purchase_receive_edit",
                    notes: "Received quantity edited",
                    created_by: user.userId,
                },
            });
        }

        const allItems = await tx.purchaseItem.findMany({
            where: { purchase_id: item.purchase_id },
            select: { qty: true, received_qty: true },
        });
        const allReceived = allItems.every((row) => row.received_qty >= row.qty);
        const someReceived = allItems.some((row) => row.received_qty > 0);

        return tx.purchase.update({
            where: { id: item.purchase_id },
            data: {
                shipping_status: allReceived
                    ? ShippingStatus.received
                    : someReceived
                        ? ShippingStatus.partial
                        : ShippingStatus.pending,
            },
            include: purchaseInclude,
        });
    });
};

/**
 * Delete a receive record: reverse its quantity effects and remove the row, all
 * in one transaction.
 *
 * It used to be two: `updateReceive(receiveId, 0)` in its own transaction,
 * followed by a separate `delete`. If the delete failed, the stock had already
 * been backed out but the receive row survived with received_qty 0 - and
 * re-running was not idempotent, because updateReceive clamps the batch with
 * Math.max(0, ...). That is the shape of "I clicked delete, it said nothing, and
 * the stock is now wrong".
 *
 * It also refuses when the received goods have already been sold. Reversing a
 * receive whose FIFO layers are partly consumed cannot be done honestly: the
 * clamp would silently swallow the difference and leave the batch, the inventory
 * level and the sale costing disagreeing with each other permanently. Better to
 * say so and let the operator delete the sale first.
 */
type ReversibleReceive = {
    id: string;
    purchase_id: string;
    purchase_item_id: string;
    received_qty: number;
    purchase_item: { product_id: string | null; product_name: string };
};

/**
 * Take one receive back out: stock, batch, item tally, history row, the receive
 * itself. Inside a caller-supplied transaction; the shipping status is the
 * caller's job, so deleting a whole memo can refresh each order once.
 *
 * Shared by deleteReceive and deleteReceiveMemo. Written once because the two
 * must stay the same reversal - a second copy of this is how stock ends up
 * disagreeing with the batches depending on which button was pressed.
 */
const reverseReceiveInTx = async (
    tx: Prisma.TransactionClient,
    receive: ReversibleReceive,
    user: IRequestUser,
    reason: string
) => {
    const delta = -receive.received_qty;
    const productId = receive.purchase_item.product_id;

    const batch = await tx.inventoryBatch.findFirst({
        where: { purchase_receive_id: receive.id, owner_id: user.ownerId },
    });

    // consumed = how much of this batch has already gone out on sales.
    const consumed = batch ? batch.received_qty - batch.remaining_qty : 0;
    if (consumed > 0) {
        throw new AppError(
            status.CONFLICT,
            `Cannot delete this receive: ${consumed} of the ${receive.received_qty} received have already been sold. Delete or edit those sales first.`
        );
    }

    await tx.purchaseItem.update({
        where: { id: receive.purchase_item_id },
        data: { received_qty: { increment: delta } },
    });

    if (productId) {
        await tx.inventory.updateMany({
            where: { owner_id: user.ownerId, product_id: productId },
            data: { available_qty: { increment: delta } },
        });

        // Nothing was consumed, so the batch has no history worth keeping and
        // deleting it is exact - no clamp, nothing swallowed.
        if (batch) {
            await tx.inventoryBatch.delete({ where: { id: batch.id } });
        }

        await tx.inventoryHistory.create({
            data: {
                owner_id: user.ownerId,
                product_id: productId,
                product_name: receive.purchase_item.product_name,
                change_type: "adjustment",
                qty_change: delta,
                reference_id: receive.purchase_id,
                reference_type: "purchase_receive_delete",
                notes: reason,
                created_by: user.userId,
            },
        });
    }

    await tx.purchaseReceive.delete({ where: { id: receive.id } });
};

const deleteReceive = async (receiveId: string, user: IRequestUser) => {
    const receive = await prisma.purchaseReceive.findFirst({
        where: { id: receiveId, owner_id: user.ownerId },
        include: { purchase_item: true },
    });

    if (!receive) {
        throw new AppError(status.NOT_FOUND, "Receive record not found");
    }

    return prisma.$transaction(async (tx) => {
        await reverseReceiveInTx(tx, receive, user, "Receive record deleted");
        return refreshShippingStatus(tx, receive.purchase_id);
    });
};

// ---------------------------------------------------------------------------
// Receive memos
//
// One lorry's worth of goods, from one supplier, possibly settling lines on
// several purchase orders at once. The Pending Products page writes these; the
// Receive Ledger reads them.
//
// Additive to everything that came before: Product Received still receives one
// line at a time with no memo, and those rows are untouched by any of this.
// ---------------------------------------------------------------------------

const memoInclude = {
    purchase_receives: {
        include: {
            purchase_item: {
                select: {
                    id: true, product_id: true, product_code: true, product_name: true,
                    qty: true, received_qty: true, actual_dp: true, dp_price: true, discount_pct: true,
                },
            },
            purchase: { select: { id: true, si_no: true, date: true } },
        },
        orderBy: { created_at: "asc" },
    },
} as const;

const getReceiveMemos = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.purchaseReceiveMemo.findMany({
        where: { owner_id: user.ownerId, ...dateRangeWhere(options) },
        include: memoInclude,
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

type IReceiveMemoLine = { purchase_item_id: string; qty: number };

export interface ICreateReceiveMemoPayload {
    date: string;
    vehicle_no?: string;
    driver_name?: string;
    driver_phone?: string;
    receiver_name: string;
    receiver_phone?: string;
    notes?: string;
    lines: IReceiveMemoLine[];
}

/**
 * Record a delivery.
 *
 * Every quantity is checked against what is actually still pending on the line
 * rather than against anything the client sent about it, because the client's
 * idea of pending is as old as its last refresh: two people receiving the same
 * lorry would otherwise book the goods twice.
 *
 * The supplier is read off the purchase orders, not taken from the request, so
 * a memo cannot be filed against a supplier who did not send the goods.
 */
const createReceiveMemo = async (payload: ICreateReceiveMemoPayload, user: IRequestUser) => {
    const itemIds = payload.lines.map((line) => line.purchase_item_id);
    if (new Set(itemIds).size !== itemIds.length) {
        throw new AppError(status.BAD_REQUEST, "The same order line appears twice in this memo");
    }

    const items = await prisma.purchaseItem.findMany({
        where: { id: { in: itemIds }, owner_id: user.ownerId },
        include: {
            product: { select: { selling_price: true } },
            purchase: { select: { id: true, si_no: true, supplier_id: true, supplier_name: true, deleted_at: true } },
        },
    });

    if (items.length !== itemIds.length) {
        throw new AppError(status.NOT_FOUND, "Some of these order lines are not in this workspace");
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    const suppliers = [...new Set(items.map((item) => item.purchase.supplier_name))];
    if (suppliers.length > 1) {
        throw new AppError(
            status.BAD_REQUEST,
            `One memo covers one supplier. These lines come from ${suppliers.join(" and ")}.`
        );
    }

    for (const line of payload.lines) {
        const item = byId.get(line.purchase_item_id)!;
        if (item.purchase.deleted_at) {
            throw new AppError(status.BAD_REQUEST, `Purchase ${item.purchase.si_no} has been deleted`);
        }
        if (!item.product_id) {
            throw new AppError(status.BAD_REQUEST, `${item.product_name} is not linked to a product, so it cannot go into stock`);
        }
        const pending = item.qty - item.received_qty;
        if (line.qty > pending) {
            throw new AppError(
                status.BAD_REQUEST,
                `${item.product_name}: receiving ${line.qty} but only ${pending} is still pending on ${item.purchase.si_no}`
            );
        }
    }

    const first = items[0]!;
    const date = new Date(payload.date);

    // Two deliveries unloaded at the same moment would read the same highest
    // number and both try to claim it. The loser of that race is a unique
    // violation on (owner_id, memo_no), and the honest answer is to look again
    // and take the next one - not to fail a delivery that really happened.
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            return await prisma.$transaction(async (tx) => {
                const issued = await tx.purchaseReceiveMemo.findMany({
                    where: { owner_id: user.ownerId, memo_no: { startsWith: memoPrefix(date) } },
                    select: { memo_no: true },
                });

                const memo = await tx.purchaseReceiveMemo.create({
                    data: {
                        owner_id: user.ownerId,
                        memo_no: nextMemoNo(issued.map((row) => row.memo_no), date),
                        date,
                        supplier_id: first.purchase.supplier_id,
                        supplier_name: first.purchase.supplier_name,
                        vehicle_no: payload.vehicle_no?.trim() ?? "",
                        driver_name: payload.driver_name?.trim() ?? "",
                        driver_phone: payload.driver_phone?.trim() ?? "",
                        receiver_name: payload.receiver_name.trim(),
                        receiver_phone: payload.receiver_phone?.trim() ?? "",
                        notes: payload.notes?.trim() ?? "",
                        created_by: user.userId,
                    },
                });

                for (const line of payload.lines) {
                    const item = byId.get(line.purchase_item_id)!;
                    await receiveItemInTx(
                        tx,
                        item.purchase,
                        item,
                        {
                            receive_date: payload.date,
                            receiver_name: memo.receiver_name,
                            received_qty: line.qty,
                            condition: "good",
                            notes: memo.memo_no,
                            memo_id: memo.id,
                        },
                        user
                    );
                }

                for (const purchaseId of new Set(payload.lines.map((line) => byId.get(line.purchase_item_id)!.purchase.id))) {
                    await refreshShippingStatus(tx, purchaseId);
                }

                return tx.purchaseReceiveMemo.findUniqueOrThrow({
                    where: { id: memo.id },
                    include: memoInclude,
                });
            });
        } catch (error) {
            const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
            if (!clash || attempt === 4) throw error;
        }
    }

    throw new AppError(status.CONFLICT, "Could not allocate a memo number, please try again");
};

/**
 * Unmake a delivery: every line goes back to pending and out of stock.
 *
 * Refuses, line by line, if any of the received goods have already been sold -
 * the same rule as deleting a single receive, for the same reason. The whole
 * memo is one transaction, so a memo whose third line has been sold is left
 * entirely alone rather than half reversed.
 */
const deleteReceiveMemo = async (memoId: string, user: IRequestUser) => {
    const memo = await prisma.purchaseReceiveMemo.findFirst({
        where: { id: memoId, owner_id: user.ownerId },
        include: { purchase_receives: { include: { purchase_item: true } } },
    });

    if (!memo) {
        throw new AppError(status.NOT_FOUND, "Receive memo not found");
    }

    return prisma.$transaction(async (tx) => {
        for (const receive of memo.purchase_receives) {
            await reverseReceiveInTx(tx, receive, user, `Receive memo ${memo.memo_no} deleted`);
        }

        for (const purchaseId of new Set(memo.purchase_receives.map((row) => row.purchase_id))) {
            await refreshShippingStatus(tx, purchaseId);
        }

        await tx.purchaseReceiveMemo.delete({ where: { id: memoId } });
        return { id: memo.id, memo_no: memo.memo_no };
    });
};

const deletePurchase = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.purchase.findFirst({
        where: { id, owner_id: user.ownerId },
        include: purchaseInclude,
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Purchase not found");
    }

    await prisma.$transaction(async (tx) => {
        // Take the received stock back out, and refuse if any of it has been sold.
        //
        // This used to delete the purchase and leave the stock behind entirely -
        // the comment said FIFO batches "keep their stock but lose the purchase
        // link (SetNull), matching the old Supabase behaviour", which meant a
        // deleted purchase corrupted the numbers three different ways at once.
        // For a PO of 100 units, all received, 30 sold:
        //
        //   Inventory page   the received_qty subquery lost its rows, so
        //                    available went from 70 to -30
        //   Sales page       inventory.available_qty untouched, still 70
        //   FIFO             70 units of orphaned batches, still costing sales
        //
        // Refusing when the goods are already sold is the same rule deleteReceive
        // uses, and the same rule deletePurchaseItem has always used for a single
        // line. It also keeps delete and restore symmetrical: nothing consumed
        // means the batches can be removed exactly and rebuilt exactly.
        const batches = await tx.inventoryBatch.findMany({
            where: { owner_id: user.ownerId, purchase_item_id: { in: existing.purchase_items.map((item) => item.id) } },
        });

        const consumed = batches.reduce((sum, batch) => sum + (batch.received_qty - batch.remaining_qty), 0);
        if (consumed > 0) {
            throw new AppError(
                status.CONFLICT,
                `Cannot delete this purchase: ${consumed} unit(s) received against it have already been sold. Delete or edit those sales first.`
            );
        }

        for (const item of existing.purchase_items) {
            if (!item.product_id || item.received_qty <= 0) continue;

            await tx.inventory.updateMany({
                where: { owner_id: user.ownerId, product_id: item.product_id },
                data: { available_qty: { decrement: item.received_qty } },
            });

            await tx.inventoryHistory.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    change_type: "adjustment",
                    qty_change: -item.received_qty,
                    reference_id: existing.id,
                    reference_type: "purchase_delete",
                    notes: `Purchase ${existing.si_no} deleted`,
                    created_by: user.userId,
                },
            });
        }

        if (batches.length > 0) {
            await tx.inventoryBatch.deleteMany({ where: { id: { in: batches.map((batch) => batch.id) } } });
        }

        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "purchases",
                row: existing,
                meta: recycleMeta,
                fallbackType: "purchases",
                fallbackTitle: existing.supplier_name,
                fallbackSubtitle: existing.si_no,
                fallbackAmount: existing.net_amount,
            }),
        });
        // Items and receives cascade.
        await tx.purchase.delete({ where: { id } });
    });

    return { message: "Purchase moved to recycle bin" };
};

/**
 * Add a line to a purchase that already exists.
 *
 * The Purchase Ledger could edit and remove lines but never add one, so a line
 * left off an invoice meant deleting the whole thing and typing it again.
 *
 * The new line has received nothing, so besides re-totalling the purchase this
 * refreshes the shipping status: adding to a fully-received invoice drops it
 * back to partial, which is what the Product Received page needs to see before
 * it will offer the new line for receiving.
 *
 * Nothing here touches inventory or FIFO. Ordering goods is not receiving
 * them - stock moves when the line is received, exactly as it does for a line
 * that was on the purchase from the start.
 */
const addPurchaseItem = async (purchaseId: string, payload: IAddPurchaseItemPayload, user: IRequestUser) => {
    const purchase = await prisma.purchase.findFirst({
        where: { id: purchaseId, owner_id: user.ownerId },
        include: { purchase_items: true },
    });

    if (!purchase) {
        throw new AppError(status.NOT_FOUND, "Purchase not found");
    }

    // The product has to be this workspace's, the same check createPurchase
    // makes on every line it writes.
    const owned = await prisma.product.count({
        where: { id: payload.product_id, owner_id: user.ownerId },
    });
    if (owned !== 1) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    return prisma.$transaction(async (tx) => {
        const item = await tx.purchaseItem.create({
            data: {
                ...payload,
                owner_id: user.ownerId,
                purchase_id: purchase.id,
                received_qty: 0,
            },
        });

        const total = purchase.purchase_items.reduce(
            (sum, row) => sum + Number(row.total_amount || 0),
            Number(item.total_amount || 0)
        );
        await tx.purchase.update({
            where: { id: purchase.id },
            data: { total_amount: total, net_amount: total },
        });

        await refreshShippingStatus(tx, purchase.id);

        return item;
    });
};

// Delete a single line item from a purchase. Only allowed when nothing has been
// received against it (otherwise inventory/FIFO would be left inconsistent). If
// it's the purchase's only remaining item, the whole purchase is removed (to
// recycle bin); otherwise the item is dropped and the purchase totals recomputed.
const deletePurchaseItem = async (itemId: string, user: IRequestUser) => {
    const item = await prisma.purchaseItem.findFirst({
        where: { id: itemId, owner_id: user.ownerId },
        include: { purchase: { include: { purchase_items: true } } },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Purchase item not found");
    }
    if ((item.received_qty ?? 0) > 0) {
        throw new AppError(status.BAD_REQUEST, "Cannot delete an item that has already been received. Reverse the received quantity first.");
    }

    const purchase = item.purchase;
    if (purchase.purchase_items.length <= 1) {
        // Last line -> remove the whole purchase (goes to recycle bin).
        return deletePurchase(purchase.id, user);
    }

    await prisma.$transaction(async (tx) => {
        await tx.purchaseItem.delete({ where: { id: itemId } });
        const total = purchase.purchase_items
            .filter((row) => row.id !== itemId)
            .reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
        await tx.purchase.update({
            where: { id: purchase.id },
            data: { total_amount: total, net_amount: total },
        });
    });

    return { message: "Purchase item deleted" };
};

export const PurchaseService = {
    getAllPurchases,
    createPurchase,
    updatePurchase,
    receivePurchaseItem,
    receiveAllPurchaseItems,
    updateReceive,
    deleteReceive,
    getReceiveMemos,
    createReceiveMemo,
    deleteReceiveMemo,
    setItemReceivedQty,
    updatePurchaseItem,
    addPurchaseItem,
    deletePurchaseItem,
    deletePurchase,
};
