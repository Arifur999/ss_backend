import status from "http-status";
import { Prisma } from "../../../generated/prisma/client.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";

// Whitelist of tables a recycle-bin snapshot may be restored into,
// mapped to their Prisma delegates.
const RESTORABLE_TABLES = [
    "products",
    "sales",
    "purchases",
    "customer_payments",
    "supplier_payments",
    "expenses",
    "investments",
    "profit_withdrawals",
    "loans",
    "loan_lenders",
    "employees",
    "salary_transactions",
    "other_incomes",
    "customers",
    "suppliers",
] as const;

type RestorableTable = (typeof RESTORABLE_TABLES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegateFor = (tableName: RestorableTable): any => {
    switch (tableName) {
        case "products": return prisma.product;
        case "sales": return prisma.sale;
        case "purchases": return prisma.purchase;
        case "customer_payments": return prisma.customerPayment;
        case "supplier_payments": return prisma.supplierPayment;
        case "expenses": return prisma.expense;
        case "investments": return prisma.investment;
        case "profit_withdrawals": return prisma.profitWithdrawal;
        case "loans": return prisma.loan;
        case "loan_lenders": return prisma.loanLender;
        case "employees": return prisma.employee;
        case "salary_transactions": return prisma.salaryTransaction;
        case "other_incomes": return prisma.otherIncome;
        case "customers": return prisma.customer;
        case "suppliers": return prisma.supplier;
    }
};

// Nested relation keys captured in snapshots that are separate tables.
const NESTED_KEYS: Record<string, string[]> = {
    sales: ["sale_items", "sale_payments", "sale_deliveries", "customer_payments", "cost_layers"],
    purchases: ["purchase_items", "purchase_receives", "supplier_payments"],
    products: ["suppliers", "supplier"],
};

const DATE_ONLY_KEYS = new Set([
    "date", "receive_date", "delivery_date", "received_date",
    "join_date", "resign_date", "period_from", "period_to",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reviveRow = (tableName: string, raw: any, ownerId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = { ...raw };

    for (const key of NESTED_KEYS[tableName] ?? []) {
        delete row[key];
    }

    for (const key of Object.keys(row)) {
        const value = row[key];
        if (typeof value !== "string") continue;
        if (DATE_ONLY_KEYS.has(key) || key.endsWith("_at") || key === "trial_start" || key === "trial_end") {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) row[key] = parsed;
        }
    }

    row.owner_id = ownerId;
    delete row.deleted_at;
    delete row.deleted_by;

    return row;
};

const getRecycleItems = async (user: IRequestUser, type?: string) => {
    return prisma.recycleBinItem.findMany({
        where: {
            owner_id: user.ownerId,
            ...(type ? { type } : {}),
        },
        orderBy: { deleted_at: "desc" },
    });
};

const restoreItem = async (id: string, user: IRequestUser) => {
    const item = await prisma.recycleBinItem.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Recycle bin item not found");
    }

    const tableName = item.table_name as RestorableTable;

    if (!RESTORABLE_TABLES.includes(tableName)) {
        throw new AppError(status.BAD_REQUEST, `Cannot restore items of type ${item.table_name}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = item.data as any;
    if (!snapshot || typeof snapshot !== "object") {
        throw new AppError(status.BAD_REQUEST, "Snapshot data is missing for this item");
    }

    await prisma.$transaction(async (tx) => {
        if (tableName === "products") {
            // Products are soft-deleted, so restoring just clears the flag.
            const restored = await tx.product.updateMany({
                where: { id: snapshot.id, owner_id: user.ownerId },
                data: { deleted_at: null, deleted_by: null },
            });
            if (restored.count === 0) {
                const row = reviveRow(tableName, snapshot, user.ownerId);
                await tx.product.create({ data: row as Prisma.ProductUncheckedCreateInput });
            }
        } else if (tableName === "sales") {
            const { sale_items, sale_payments, sale_deliveries } = snapshot;
            const row = reviveRow(tableName, snapshot, user.ownerId);
            await tx.sale.create({ data: row as Prisma.SaleUncheckedCreateInput });

            for (const rawItem of sale_items ?? []) {
                await tx.saleItem.create({
                    data: reviveRow("sale_items", rawItem, user.ownerId) as Prisma.SaleItemUncheckedCreateInput,
                });
            }
            for (const rawPayment of sale_payments ?? []) {
                await tx.salePayment.create({
                    data: reviveRow("sale_payments", rawPayment, user.ownerId) as Prisma.SalePaymentUncheckedCreateInput,
                });
            }
            for (const rawDelivery of sale_deliveries ?? []) {
                await tx.saleDelivery.create({
                    data: reviveRow("sale_deliveries", rawDelivery, user.ownerId) as Prisma.SaleDeliveryUncheckedCreateInput,
                });
            }
        } else if (tableName === "purchases") {
            const { purchase_items } = snapshot;
            const row = reviveRow(tableName, snapshot, user.ownerId);
            await tx.purchase.create({ data: row as Prisma.PurchaseUncheckedCreateInput });

            for (const rawItem of purchase_items ?? []) {
                const { purchase_receives, ...itemRaw } = rawItem;
                const item = await tx.purchaseItem.create({
                    data: reviveRow("purchase_items", itemRaw, user.ownerId) as Prisma.PurchaseItemUncheckedCreateInput,
                });
                for (const rawReceive of purchase_receives ?? []) {
                    await tx.purchaseReceive.create({
                        data: reviveRow("purchase_receives", rawReceive, user.ownerId) as Prisma.PurchaseReceiveUncheckedCreateInput,
                    });
                }

                // Put the stock back, the mirror of what deletePurchase took out.
                //
                // Restore recreated the purchase, its items (carrying their
                // received_qty) and its receives, but not the stock those receives
                // represent - so a restored purchase read as received while the
                // goods were missing from inventory and had no FIFO layer to be
                // costed from.
                //
                // deletePurchase refuses when any of the received stock has been
                // sold, so a purchase in the bin always had fully-unconsumed
                // batches. That is what makes this exact: remaining_qty is the
                // full received_qty, with nothing to reconstruct.
                if (item.product_id && item.received_qty > 0) {
                    await tx.inventory.upsert({
                        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: item.product_id } },
                        create: {
                            owner_id: user.ownerId,
                            product_id: item.product_id,
                            available_qty: item.received_qty,
                            upcoming_qty: 0,
                        },
                        update: { available_qty: { increment: item.received_qty } },
                    });

                    await tx.inventoryBatch.create({
                        data: {
                            owner_id: user.ownerId,
                            product_id: item.product_id,
                            purchase_item_id: item.id,
                            source_type: "purchase_receive",
                            received_qty: item.received_qty,
                            remaining_qty: item.received_qty,
                            dp_price: item.actual_dp,
                            mrp_price: 0,
                            received_date: new Date(),
                            created_by: user.userId,
                        },
                    });

                    await tx.inventoryHistory.create({
                        data: {
                            owner_id: user.ownerId,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            change_type: "adjustment",
                            qty_change: item.received_qty,
                            reference_id: item.purchase_id,
                            reference_type: "purchase_restore",
                            notes: "Purchase restored from recycle bin",
                            created_by: user.userId,
                        },
                    });
                }
            }
        } else {
            const delegate = delegateFor(tableName);
            const row = reviveRow(tableName, snapshot, user.ownerId);
            await delegate.create({ data: row });
        }

        await tx.recycleBinItem.delete({ where: { id } });
    });

    return { message: "Item restored successfully" };
};

const deleteItemPermanently = async (id: string, user: IRequestUser) => {
    const item = await prisma.recycleBinItem.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Recycle bin item not found");
    }

    await prisma.$transaction(async (tx) => {
        // Products live in their table as soft-deleted rows - remove for real.
        if (item.table_name === "products") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const snapshot = item.data as any;
            if (snapshot?.id) {
                const [purchaseItemCount, saleItemCount] = await Promise.all([
                    tx.purchaseItem.count({ where: { product_id: snapshot.id } }),
                    tx.saleItem.count({ where: { product_id: snapshot.id } }),
                ]);
                // Products with transaction history stay soft-deleted
                // (mirrors the old guard_product_transaction_deletes trigger).
                if (purchaseItemCount === 0 && saleItemCount === 0) {
                    await tx.product.deleteMany({ where: { id: snapshot.id, owner_id: user.ownerId } });
                }
            }
        }

        await tx.recycleBinItem.delete({ where: { id } });
    });

    return { message: "Item permanently deleted" };
};

const emptyRecycleBin = async (user: IRequestUser) => {
    const result = await prisma.recycleBinItem.deleteMany({
        where: { owner_id: user.ownerId },
    });

    return { message: `Recycle bin emptied (${result.count} items removed)` };
};

export const RecycleBinService = {
    getRecycleItems,
    restoreItem,
    deleteItemPermanently,
    emptyRecycleBin,
};
