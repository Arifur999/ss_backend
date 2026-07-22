import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { ICreateProductPayload, IUpdateProductPayload } from "./product.validation.js";

// Supabase joins returned the relation under the table name ("suppliers"),
// and the frontend reads product.suppliers — keep that shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toSupabaseShape = (product: any) => {
    if (!product) return product;
    const { supplier, ...rest } = product;
    return { ...rest, suppliers: supplier ?? null };
};

type Tx = Prisma.TransactionClient;

// Replaces the old auto_create_inventory_for_products trigger + client-side
// createOpeningStockBatch: bootstrap inventory row, opening stock FIFO batch
// and an inventory history entry for a newly created product.
const bootstrapProductInventory = async (
    tx: Tx,
    product: { id: string; name: string; opening_qty: number; cost_price: Prisma.Decimal; selling_price: Prisma.Decimal },
    user: IRequestUser
) => {
    await tx.inventory.upsert({
        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: product.id } },
        create: {
            owner_id: user.ownerId,
            product_id: product.id,
            available_qty: product.opening_qty,
            upcoming_qty: 0,
        },
        update: {},
    });

    if (product.opening_qty > 0) {
        await tx.inventoryBatch.create({
            data: {
                owner_id: user.ownerId,
                product_id: product.id,
                source_type: "opening_stock",
                received_qty: product.opening_qty,
                remaining_qty: product.opening_qty,
                dp_price: product.cost_price,
                mrp_price: product.selling_price,
                received_date: new Date(),
                created_by: user.userId,
            },
        });

        await tx.inventoryHistory.create({
            data: {
                owner_id: user.ownerId,
                product_id: product.id,
                product_name: product.name,
                change_type: "adjustment",
                qty_change: product.opening_qty,
                qty_before: 0,
                qty_after: product.opening_qty,
                reference_type: "opening_stock",
                notes: "Opening stock",
                created_by: user.userId,
            },
        });
    }
};

const getAllProducts = async (user: IRequestUser, includeDeleted = false) => {
    const products = await prisma.product.findMany({
        where: {
            owner_id: user.ownerId,
            ...(includeDeleted ? { deleted_at: { not: null } } : { deleted_at: null }),
        },
        include: { supplier: true },
        orderBy: { created_at: "desc" },
    });
    return products.map(toSupabaseShape);
};

const createProduct = async (payload: ICreateProductPayload, user: IRequestUser) => {
    // No separate pre-check query for an existing product_code - the
    // @@unique([owner_id, product_code]) constraint already guarantees this,
    // so checking first only costs an extra network round trip to the DB on
    // every single create (noticeable when the app and Postgres are far from
    // each other, e.g. deployed to a different region than most users are
    // in). Catching P2002 from the create() itself gets the same guarantee
    // and the same friendly message for free.
    const product = await prisma.$transaction(async (tx) => {
        let created;
        try {
            created = await tx.product.create({
                data: { ...payload, owner_id: user.ownerId },
                include: { supplier: true },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new AppError(status.CONFLICT, "A product with this code already exists");
            }
            throw error;
        }

        await bootstrapProductInventory(tx, created, user);

        return created;
    });

    return toSupabaseShape(product);
};

// CSV import: upsert by product_code within the owner's workspace.
const bulkUpsertProducts = async (payloads: ICreateProductPayload[], user: IRequestUser) => {
    const results = await prisma.$transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saved: any[] = [];

        for (const payload of payloads) {
            const existing = await tx.product.findUnique({
                where: { owner_id_product_code: { owner_id: user.ownerId, product_code: payload.product_code } },
            });

            if (existing) {
                const updated = await tx.product.update({
                    where: { id: existing.id },
                    data: { ...payload, deleted_at: null, deleted_by: null },
                    include: { supplier: true },
                });
                saved.push(updated);
            } else {
                const created = await tx.product.create({
                    data: { ...payload, owner_id: user.ownerId },
                    include: { supplier: true },
                });
                await bootstrapProductInventory(tx, created, user);
                saved.push(created);
            }
        }

        return saved;
    });

    return results.map(toSupabaseShape);
};

const updateProduct = async (id: string, payload: IUpdateProductPayload, user: IRequestUser) => {
    const existing = await prisma.product.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    const product = await prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
            where: { id },
            data: payload,
            include: { supplier: true },
        });

        // If opening qty changed, sync the opening stock batch + inventory level.
        if (payload.opening_qty !== undefined && payload.opening_qty !== existing.opening_qty) {
            const delta = payload.opening_qty - existing.opening_qty;

            const openingBatch = await tx.inventoryBatch.findFirst({
                where: { owner_id: user.ownerId, product_id: id, source_type: "opening_stock" },
                orderBy: { created_at: "asc" },
            });

            if (openingBatch) {
                await tx.inventoryBatch.update({
                    where: { id: openingBatch.id },
                    data: {
                        received_qty: { increment: delta },
                        remaining_qty: { increment: delta },
                    },
                });
            } else if (payload.opening_qty > 0) {
                await tx.inventoryBatch.create({
                    data: {
                        owner_id: user.ownerId,
                        product_id: id,
                        source_type: "opening_stock",
                        received_qty: payload.opening_qty,
                        remaining_qty: payload.opening_qty,
                        dp_price: updated.cost_price,
                        mrp_price: updated.selling_price,
                        received_date: new Date(),
                        created_by: user.userId,
                    },
                });
            }

            const inventory = await tx.inventory.upsert({
                where: { owner_id_product_id: { owner_id: user.ownerId, product_id: id } },
                create: {
                    owner_id: user.ownerId,
                    product_id: id,
                    available_qty: payload.opening_qty,
                    upcoming_qty: 0,
                },
                update: { available_qty: { increment: delta } },
            });

            await tx.inventoryHistory.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: id,
                    product_name: updated.name,
                    change_type: "adjustment",
                    qty_change: delta,
                    qty_before: inventory.available_qty - delta,
                    qty_after: inventory.available_qty,
                    reference_type: "opening_stock_update",
                    notes: "Opening stock updated",
                    created_by: user.userId,
                },
            });
        }

        return updated;
    });

    return toSupabaseShape(product);
};

// Soft delete into the recycle bin. Hard deletes only happen from the
// recycle bin module (with transaction guards).
const deleteProduct = async (id: string, user: IRequestUser) => {
    const existing = await prisma.product.findFirst({
        where: { id, owner_id: user.ownerId },
        include: { supplier: true },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.product.update({
            where: { id },
            data: { deleted_at: new Date(), deleted_by: user.userId },
        });

        await tx.recycleBinItem.create({
            data: {
                owner_id: user.ownerId,
                type: "products",
                title: existing.name,
                subtitle: existing.product_code,
                amount: existing.selling_price,
                table_name: "products",
                data: JSON.parse(JSON.stringify(toSupabaseShape(existing))),
                deleted_by: user.userId,
            },
        });
    });

    return { message: "Product moved to recycle bin" };
};

export const ProductService = {
    getAllProducts,
    createProduct,
    bulkUpsertProducts,
    updateProduct,
    deleteProduct,
};
