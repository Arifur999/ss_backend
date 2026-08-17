import status from "http-status";
import { ShippingStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { createReceiveStockBatch } from "../inventory/fifo.helpers.js";
import { ICreatePurchasePayload, IReceivePurchaseItemPayload, IUpdatePurchasePayload } from "./purchase.validation.js";

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

const createPurchase = async (payload: ICreatePurchasePayload, user: IRequestUser) => {
    const { items, ...purchaseData } = payload;

    const existing = await prisma.purchase.findUnique({
        where: { owner_id_si_no: { owner_id: user.ownerId, si_no: payload.si_no } },
    });

    if (existing) {
        throw new AppError(status.CONFLICT, "A purchase with this SI no already exists");
    }

    return prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
            data: {
                ...purchaseData,
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

// The old client-side saveReceive flow (6 separate requests) as one transaction:
// receive row -> item received_qty -> inventory level -> FIFO batch (+preorder
// settlement) -> inventory history -> purchase shipping status.
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
        const receiveRow = await tx.purchaseReceive.create({
            data: {
                owner_id: user.ownerId,
                purchase_id: purchaseId,
                purchase_item_id: item.id,
                receive_date: new Date(payload.receive_date),
                receiver_name: payload.receiver_name,
                received_qty: payload.received_qty,
                condition: payload.condition,
                notes: payload.notes ?? "",
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
                dpPrice: Number(item.actual_dp) || Number(item.dp_price) || 0,
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
                reference_id: purchaseId,
                reference_type: "purchase",
                notes: `Received from purchase ${purchase.si_no}`,
                created_by: user.userId,
            },
        });

        // Recalculate purchase shipping status from all items.
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
const deleteReceive = async (receiveId: string, user: IRequestUser) => {
    const receive = await prisma.purchaseReceive.findFirst({
        where: { id: receiveId, owner_id: user.ownerId },
        include: { purchase_item: true },
    });

    if (!receive) {
        throw new AppError(status.NOT_FOUND, "Receive record not found");
    }

    const delta = -receive.received_qty;
    const productId = receive.purchase_item.product_id;

    return prisma.$transaction(async (tx) => {
        const batch = await tx.inventoryBatch.findFirst({
            where: { purchase_receive_id: receiveId, owner_id: user.ownerId },
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
                    notes: "Receive record deleted",
                    created_by: user.userId,
                },
            });
        }

        await tx.purchaseReceive.delete({ where: { id: receiveId } });

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
    updateReceive,
    deleteReceive,
    setItemReceivedQty,
    updatePurchaseItem,
    deletePurchaseItem,
    deletePurchase,
};
