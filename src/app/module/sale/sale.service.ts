import status from "http-status";
import { DeliveryStatus, Prisma } from "../../../generated/prisma/client.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { consumeFifoForSaleItem, releaseFifoForSaleItem } from "../inventory/fifo.helpers.js";
import { ICreateSaleDeliveryPayload, ICreateSalePayload, ISaleItemPayload, ISalePaymentPayload } from "./sale.validation.js";

type Tx = Prisma.TransactionClient;

const saleInclude = {
    sale_items: true,
    sale_payments: true,
    sale_deliveries: true,
} as const;

const getAllSales = async (user: IRequestUser) => {
    return prisma.sale.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        include: saleInclude,
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

// The old client retried duplicate invoice numbers; the server just finds the
// next free one up front.
const resolveInvoiceNo = async (tx: Tx, ownerId: string, requested: string, ignoreSaleId?: string) => {
    let candidate = requested;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const existing = await tx.sale.findUnique({
            where: { owner_id_invoice_no: { owner_id: ownerId, invoice_no: candidate } },
            select: { id: true },
        });
        if (!existing || existing.id === ignoreSaleId) return candidate;
        candidate = `${requested}-${attempt + 1}`;
    }
    return `${requested}-${Date.now()}`;
};

const computeDeliveryStatus = (items: { qty: number; delivered_qty: number }[]): DeliveryStatus => {
    const allDelivered = items.length > 0 && items.every((item) => item.delivered_qty >= item.qty);
    const someDelivered = items.some((item) => item.delivered_qty > 0);
    return allDelivered ? "delivered" : someDelivered ? "partial" : "pending";
};

// Inserts sale items, consumes FIFO stock, adjusts inventory and creates
// initial deliveries for pre-delivered quantities.
const insertSaleItems = async (
    tx: Tx,
    sale: { id: string; invoice_no: string; date: Date },
    items: ISaleItemPayload[],
    user: IRequestUser
) => {
    for (const item of items) {
        // manual_cost is destructured out on purpose so it never reaches the
        // create() spread below - the sale item's cost is always FIFO/costed
        // server-side, never taken directly from client input.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { manual_cost, delivered_qty, ...itemData } = item;

        const saleItem = await tx.saleItem.create({
            data: {
                ...itemData,
                delivered_qty: delivered_qty ?? 0,
                owner_id: user.ownerId,
                sale_id: sale.id,
            },
        });

        await consumeFifoForSaleItem(
            tx,
            {
                saleId: sale.id,
                saleItemId: saleItem.id,
                productId: item.product_id,
                qty: item.qty,
                fallbackCost: item.cost_price ?? 0,
            },
            user
        );

        // Stock goes out at sale time (negative stock = preorder, allowed).
        const inventory = await tx.inventory.upsert({
            where: { owner_id_product_id: { owner_id: user.ownerId, product_id: item.product_id } },
            create: {
                owner_id: user.ownerId,
                product_id: item.product_id,
                available_qty: -item.qty,
                upcoming_qty: 0,
            },
            update: { available_qty: { decrement: item.qty } },
        });

        await tx.inventoryHistory.create({
            data: {
                owner_id: user.ownerId,
                product_id: item.product_id,
                product_name: item.product_name,
                change_type: "sales_out",
                qty_change: -item.qty,
                qty_before: inventory.available_qty + item.qty,
                qty_after: inventory.available_qty,
                reference_id: sale.id,
                reference_type: "sale",
                notes: `Sold in invoice ${sale.invoice_no}`,
                created_by: user.userId,
            },
        });

        if ((delivered_qty ?? 0) > 0) {
            await tx.saleDelivery.create({
                data: {
                    owner_id: user.ownerId,
                    sale_id: sale.id,
                    sale_item_id: saleItem.id,
                    delivery_date: sale.date,
                    delivered_qty: delivered_qty ?? 0,
                    delivered_by: "",
                    notes: "Delivered at sale time",
                    created_by: user.userId,
                },
            });
        }
    }
};

// Rolls a sale's items back out of FIFO + inventory (used by edit + delete).
const rollbackSaleItems = async (
    tx: Tx,
    sale: { id: string; invoice_no: string },
    items: { id: string; product_id: string | null; product_name: string; qty: number }[],
    user: IRequestUser
) => {
    for (const item of items) {
        await releaseFifoForSaleItem(tx, item.id);

        if (item.product_id) {
            const inventory = await tx.inventory.upsert({
                where: { owner_id_product_id: { owner_id: user.ownerId, product_id: item.product_id } },
                create: {
                    owner_id: user.ownerId,
                    product_id: item.product_id,
                    available_qty: item.qty,
                    upcoming_qty: 0,
                },
                update: { available_qty: { increment: item.qty } },
            });

            await tx.inventoryHistory.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    change_type: "adjustment",
                    qty_change: item.qty,
                    qty_before: inventory.available_qty - item.qty,
                    qty_after: inventory.available_qty,
                    reference_id: sale.id,
                    reference_type: "sale_rollback",
                    notes: `Rolled back from invoice ${sale.invoice_no}`,
                    created_by: user.userId,
                },
            });
        }
    }
};

const insertSalePayments = async (
    tx: Tx,
    sale: { id: string; invoice_no: string; date: Date; customer_id: string | null; customer_name: string },
    payments: ISalePaymentPayload[],
    user: IRequestUser
) => {
    await tx.salePayment.deleteMany({ where: { sale_id: sale.id } });

    for (const payment of payments) {
        await tx.salePayment.create({
            data: {
                owner_id: user.ownerId,
                sale_id: sale.id,
                invoice_no: sale.invoice_no,
                date: payment.date ? new Date(payment.date) : sale.date,
                customer_id: sale.customer_id,
                customer_name: sale.customer_name,
                account_id: payment.account_id,
                account_name: payment.account_name ?? "",
                amount: payment.amount,
                created_by: user.userId,
            },
        });
    }
};

const createSale = async (payload: ICreateSalePayload, user: IRequestUser) => {
    const { items, payments, ...saleData } = payload;

    return prisma.$transaction(async (tx) => {
        const invoiceNo = await resolveInvoiceNo(tx, user.ownerId, saleData.invoice_no);

        const sale = await tx.sale.create({
            data: {
                ...saleData,
                invoice_no: invoiceNo,
                date: new Date(saleData.date),
                delivery_status: computeDeliveryStatus(
                    items.map((item) => ({ qty: item.qty, delivered_qty: item.delivered_qty ?? 0 }))
                ),
                owner_id: user.ownerId,
                created_by: user.userId,
            },
        });

        await insertSaleItems(tx, sale, items, user);
        await insertSalePayments(tx, sale, payments ?? [], user);

        return tx.sale.findUniqueOrThrow({
            where: { id: sale.id },
            include: saleInclude,
        });
    });
};

const updateSale = async (id: string, payload: ICreateSalePayload, user: IRequestUser) => {
    const existing = await prisma.sale.findFirst({
        where: { id, owner_id: user.ownerId },
        include: { sale_items: true },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Sale not found");
    }

    const { items, payments, ...saleData } = payload;

    return prisma.$transaction(async (tx) => {
        await rollbackSaleItems(tx, existing, existing.sale_items, user);
        await tx.saleItem.deleteMany({ where: { sale_id: id } });

        const invoiceNo = await resolveInvoiceNo(tx, user.ownerId, saleData.invoice_no, id);

        const sale = await tx.sale.update({
            where: { id },
            data: {
                ...saleData,
                invoice_no: invoiceNo,
                date: new Date(saleData.date),
                delivery_status: computeDeliveryStatus(
                    items.map((item) => ({ qty: item.qty, delivered_qty: item.delivered_qty ?? 0 }))
                ),
            },
        });

        await insertSaleItems(tx, sale, items, user);
        await insertSalePayments(tx, sale, payments ?? [], user);

        return tx.sale.findUniqueOrThrow({
            where: { id },
            include: saleInclude,
        });
    });
};

const deleteSale = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.sale.findFirst({
        where: { id, owner_id: user.ownerId },
        include: saleInclude,
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Sale not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "sales",
                row: existing,
                meta: recycleMeta,
                fallbackType: "sales",
                fallbackTitle: existing.customer_name,
                fallbackSubtitle: existing.invoice_no,
                fallbackAmount: existing.net_amount,
            }),
        });

        await rollbackSaleItems(tx, existing, existing.sale_items, user);
        await tx.sale.delete({ where: { id } });
    });

    return { message: "Sale moved to recycle bin" };
};

const addDelivery = async (saleId: string, payload: ICreateSaleDeliveryPayload, user: IRequestUser) => {
    const sale = await prisma.sale.findFirst({
        where: { id: saleId, owner_id: user.ownerId },
    });

    if (!sale) {
        throw new AppError(status.NOT_FOUND, "Sale not found");
    }

    const item = await prisma.saleItem.findFirst({
        where: { id: payload.sale_item_id, sale_id: saleId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Sale item not found");
    }

    return prisma.$transaction(async (tx) => {
        await tx.saleDelivery.create({
            data: {
                owner_id: user.ownerId,
                sale_id: saleId,
                sale_item_id: item.id,
                delivery_date: new Date(payload.delivery_date),
                delivered_qty: payload.delivered_qty,
                delivered_by: payload.delivered_by ?? "",
                notes: payload.notes ?? "",
                created_by: user.userId,
            },
        });

        await tx.saleItem.update({
            where: { id: item.id },
            data: { delivered_qty: { increment: payload.delivered_qty } },
        });

        const allItems = await tx.saleItem.findMany({
            where: { sale_id: saleId },
            select: { qty: true, delivered_qty: true },
        });

        return tx.sale.update({
            where: { id: saleId },
            data: { delivery_status: computeDeliveryStatus(allItems) },
            include: saleInclude,
        });
    });
};

const deleteDelivery = async (deliveryId: string, user: IRequestUser) => {
    const delivery = await prisma.saleDelivery.findFirst({
        where: { id: deliveryId, owner_id: user.ownerId },
    });

    if (!delivery) {
        throw new AppError(status.NOT_FOUND, "Delivery record not found");
    }

    return prisma.$transaction(async (tx) => {
        await tx.saleDelivery.delete({ where: { id: deliveryId } });

        await tx.saleItem.update({
            where: { id: delivery.sale_item_id },
            data: { delivered_qty: { decrement: delivery.delivered_qty } },
        });

        const allItems = await tx.saleItem.findMany({
            where: { sale_id: delivery.sale_id },
            select: { qty: true, delivered_qty: true },
        });

        return tx.sale.update({
            where: { id: delivery.sale_id },
            data: { delivery_status: computeDeliveryStatus(allItems) },
            include: saleInclude,
        });
    });
};

// Partial header update (legacy account backfill, delivery status refresh).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patchSale = async (id: string, payload: Record<string, any>, user: IRequestUser) => {
    const existing = await prisma.sale.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Sale not found");
    }

    const allowedFields = [
        "account_id", "account_name", "notes", "status", "delivery_status",
        "customer_name", "customer_phone", "customer_address", "customer_id",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    for (const field of allowedFields) {
        if (field in payload) data[field] = payload[field];
    }

    return prisma.sale.update({
        where: { id },
        data,
        include: saleInclude,
    });
};

// Manual purchase-rate override for one sale item (old setManualCostForSaleItem):
// releases existing layers, re-consumes batches at the manual unit cost.
const setManualCost = async (itemId: string, unitCost: number, user: IRequestUser) => {
    const item = await prisma.saleItem.findFirst({
        where: { id: itemId, owner_id: user.ownerId },
    });

    if (!item) {
        throw new AppError(status.NOT_FOUND, "Sale item not found");
    }

    return prisma.$transaction(async (tx) => {
        await releaseFifoForSaleItem(tx, itemId);

        let remaining = item.qty;

        if (item.product_id) {
            const batches = await tx.inventoryBatch.findMany({
                where: { owner_id: user.ownerId, product_id: item.product_id, remaining_qty: { gt: 0 } },
                orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
            });

            for (const batch of batches) {
                if (remaining <= 0) break;
                const takeQty = Math.min(batch.remaining_qty, remaining);
                if (takeQty <= 0) continue;

                await tx.saleItemCostLayer.create({
                    data: {
                        owner_id: user.ownerId,
                        sale_id: item.sale_id,
                        sale_item_id: itemId,
                        product_id: item.product_id,
                        inventory_batch_id: batch.id,
                        source_type: "manual",
                        qty: takeQty,
                        dp_price: unitCost,
                        cost_amount: takeQty * unitCost,
                        created_by: user.userId,
                    },
                });
                remaining -= takeQty;

                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: { remaining_qty: batch.remaining_qty - takeQty },
                });
            }
        }

        if (remaining > 0) {
            await tx.saleItemCostLayer.create({
                data: {
                    owner_id: user.ownerId,
                    sale_id: item.sale_id,
                    sale_item_id: itemId,
                    product_id: item.product_id,
                    inventory_batch_id: null,
                    source_type: "manual",
                    qty: remaining,
                    dp_price: unitCost,
                    cost_amount: remaining * unitCost,
                    created_by: user.userId,
                },
            });
        }

        return tx.saleItem.update({
            where: { id: itemId },
            data: { cost_price: unitCost },
        });
    });
};

export const SaleService = {
    getAllSales,
    createSale,
    updateSale,
    patchSale,
    deleteSale,
    addDelivery,
    deleteDelivery,
    setManualCost,
};
