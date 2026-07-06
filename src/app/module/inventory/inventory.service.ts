import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { adjustInventoryLevel } from "./fifo.helpers.js";
import { IAdjustInventoryPayload } from "./inventory.validation.js";

// Supabase join shape: inventory rows carry `products` relation key.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toSupabaseShape = (row: any) => {
    if (!row) return row;
    const { product, ...rest } = row;
    return { ...rest, products: product ?? null };
};

const getAllInventory = async (user: IRequestUser) => {
    const rows = await prisma.inventory.findMany({
        where: { owner_id: user.ownerId },
        include: { product: true },
        orderBy: { updated_at: "desc" },
    });
    return rows.map(toSupabaseShape);
};

const getInventoryHistory = async (user: IRequestUser, productId?: string) => {
    return prisma.inventoryHistory.findMany({
        where: {
            owner_id: user.ownerId,
            ...(productId ? { product_id: productId } : {}),
        },
        orderBy: { created_at: "desc" },
        take: 500,
    });
};

const getInventoryBatches = async (user: IRequestUser, productId?: string) => {
    return prisma.inventoryBatch.findMany({
        where: {
            owner_id: user.ownerId,
            ...(productId ? { product_id: productId } : {}),
        },
        orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
    });
};

// Manual stock adjustment (Inventory page): updates level + history, and
// keeps FIFO batches in sync (increase -> new adjustment batch; decrease ->
// consume oldest batches).
const adjustInventory = async (payload: IAdjustInventoryPayload, user: IRequestUser) => {
    const product = await prisma.product.findFirst({
        where: { id: payload.product_id, owner_id: user.ownerId },
    });

    if (!product) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    return prisma.$transaction(async (tx) => {
        const inventory = await adjustInventoryLevel(
            tx,
            {
                productId: payload.product_id,
                productName: payload.product_name,
                qtyChange: payload.qty_change,
                changeType: "adjustment",
                referenceType: "manual_adjustment",
                notes: payload.notes ?? "Manual adjustment",
            },
            user
        );

        if (payload.qty_change > 0) {
            await tx.inventoryBatch.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: payload.product_id,
                    source_type: "adjustment",
                    received_qty: payload.qty_change,
                    remaining_qty: payload.qty_change,
                    dp_price: payload.dp_price ?? product.cost_price,
                    mrp_price: payload.mrp_price ?? product.selling_price,
                    received_date: new Date(),
                    created_by: user.userId,
                },
            });
        } else if (payload.qty_change < 0) {
            let toRemove = Math.abs(payload.qty_change);
            const batches = await tx.inventoryBatch.findMany({
                where: { owner_id: user.ownerId, product_id: payload.product_id, remaining_qty: { gt: 0 } },
                orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
            });
            for (const batch of batches) {
                if (toRemove <= 0) break;
                const take = Math.min(batch.remaining_qty, toRemove);
                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: { remaining_qty: batch.remaining_qty - take },
                });
                toRemove -= take;
            }
        }

        return inventory;
    });
};

// Manual DP price override from the Inventory page: syncs the inventory row
// and the product's opening stock batches.
const setDpPrice = async (productId: string, dpPrice: number | null, user: IRequestUser) => {
    const inventory = await prisma.inventory.findUnique({
        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: productId } },
    });

    if (!inventory) {
        throw new AppError(status.NOT_FOUND, "Inventory row not found");
    }

    return prisma.$transaction(async (tx) => {
        const updated = await tx.inventory.update({
            where: { id: inventory.id },
            data: { dp_price: dpPrice },
        });

        if (dpPrice !== null) {
            await tx.inventoryBatch.updateMany({
                where: { owner_id: user.ownerId, product_id: productId, source_type: "opening_stock" },
                data: { dp_price: dpPrice },
            });
        }

        return updated;
    });
};

export const InventoryService = {
    getAllInventory,
    getInventoryHistory,
    getInventoryBatches,
    adjustInventory,
    setDpPrice,
};
