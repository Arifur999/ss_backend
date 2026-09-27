import { Prisma } from "../../../generated/prisma/client.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { roundTaka } from "../../shared/money.js";
import { planBatchDraw } from "../../shared/batchDraw.js";

// Server-side port of the old client-side src/lib/fifoInventory.ts.
// Every function takes a Prisma transaction client so callers can compose
// them atomically (the old client code ran these as separate requests and
// could corrupt costing when two users raced each other).

type Tx = Prisma.TransactionClient;

const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export const updateSaleItemAverageCost = async (tx: Tx, saleItemId: string) => {
    const layers = await tx.saleItemCostLayer.findMany({
        where: { sale_item_id: saleItemId },
        select: { qty: true, cost_amount: true },
    });

    const qty = layers.reduce((sum, layer) => sum + layer.qty, 0);
    const cost = layers.reduce((sum, layer) => sum + num(layer.cost_amount), 0);
    if (qty <= 0) return;

    // Whole taka. This is a total divided by a quantity, so it is the one
    // derived figure on the server that reliably produced paisa: layers of
    // 100 + 101 + 101 over three units stored 100.666..., and every profit
    // figure on every report multiplies this back up by the quantity.
    await tx.saleItem.update({
        where: { id: saleItemId },
        data: { cost_price: roundTaka(cost / qty) },
    });
};

// When new stock arrives, settle any preorder (negative-stock) cost layers
// that were waiting for a batch, oldest first.
export const settlePendingPreorderCosts = async (
    tx: Tx,
    batch: { id: string; product_id: string; remaining_qty: number; dp_price: Prisma.Decimal | number },
    user: IRequestUser
) => {
    let remaining = batch.remaining_qty;
    if (remaining <= 0) return;

    const pendingLayers = await tx.saleItemCostLayer.findMany({
        where: {
            owner_id: user.ownerId,
            product_id: batch.product_id,
            source_type: "preorder",
            inventory_batch_id: null,
        },
        orderBy: { created_at: "asc" },
    });

    const touchedSaleItems = new Set<string>();

    for (const layer of pendingLayers) {
        if (remaining <= 0) break;
        const layerQty = layer.qty;
        if (layerQty <= 0) continue;

        const takeQty = Math.min(layerQty, remaining);

        if (takeQty === layerQty) {
            await tx.saleItemCostLayer.update({
                where: { id: layer.id },
                data: {
                    inventory_batch_id: batch.id,
                    source_type: "fifo",
                    dp_price: batch.dp_price,
                    cost_amount: takeQty * num(batch.dp_price),
                },
            });
        } else {
            await tx.saleItemCostLayer.update({
                where: { id: layer.id },
                data: {
                    qty: layerQty - takeQty,
                    cost_amount: (layerQty - takeQty) * num(layer.dp_price),
                },
            });
            await tx.saleItemCostLayer.create({
                data: {
                    owner_id: user.ownerId,
                    sale_id: layer.sale_id,
                    sale_item_id: layer.sale_item_id,
                    product_id: batch.product_id,
                    inventory_batch_id: batch.id,
                    source_type: "fifo",
                    qty: takeQty,
                    dp_price: batch.dp_price,
                    cost_amount: takeQty * num(batch.dp_price),
                    created_by: user.userId,
                },
            });
        }

        if (layer.sale_item_id) touchedSaleItems.add(layer.sale_item_id);
        remaining -= takeQty;
    }

    if (remaining !== batch.remaining_qty) {
        await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { remaining_qty: remaining },
        });

        for (const saleItemId of touchedSaleItems) {
            await updateSaleItemAverageCost(tx, saleItemId);
        }
    }
};

export const createReceiveStockBatch = async (
    tx: Tx,
    input: {
        productId: string;
        purchaseItemId: string;
        purchaseReceiveId?: string | null;
        qty: number;
        dpPrice: number;
        mrpPrice: number;
        receiveDate: Date;
    },
    user: IRequestUser
) => {
    if (!input.productId || input.qty <= 0) return null;

    const batch = await tx.inventoryBatch.create({
        data: {
            owner_id: user.ownerId,
            product_id: input.productId,
            purchase_item_id: input.purchaseItemId,
            purchase_receive_id: input.purchaseReceiveId ?? null,
            source_type: "purchase_receive",
            received_qty: input.qty,
            remaining_qty: input.qty,
            dp_price: input.dpPrice,
            mrp_price: input.mrpPrice,
            received_date: input.receiveDate,
            created_by: user.userId,
        },
    });

    await settlePendingPreorderCosts(
        tx,
        { id: batch.id, product_id: batch.product_id, remaining_qty: batch.remaining_qty, dp_price: batch.dp_price },
        user
    );

    return batch;
};

// Consume stock batches oldest-first for a sale item; overflow becomes a
// "preorder" layer priced at the fallback cost. Returns the unit cost.
export const consumeFifoForSaleItem = async (
    tx: Tx,
    input: {
        saleId: string;
        saleItemId: string;
        productId: string;
        qty: number;
        fallbackCost: number;
        replaceExisting?: boolean;
    },
    user: IRequestUser
) => {
    const qty = Math.max(0, input.qty);
    if (!input.productId || qty <= 0) return input.fallbackCost;

    if (input.replaceExisting !== false) {
        await tx.saleItemCostLayer.deleteMany({ where: { sale_item_id: input.saleItemId } });
    }

    const batches = await tx.inventoryBatch.findMany({
        where: { owner_id: user.ownerId, product_id: input.productId, remaining_qty: { gt: 0 } },
        orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
    });

    let remaining = qty;
    let totalCost = 0;

    for (const batch of batches) {
        if (remaining <= 0) break;
        const takeQty = Math.min(batch.remaining_qty, remaining);
        if (takeQty <= 0) continue;

        const dpPrice = num(batch.dp_price);
        await tx.saleItemCostLayer.create({
            data: {
                owner_id: user.ownerId,
                sale_id: input.saleId,
                sale_item_id: input.saleItemId,
                product_id: input.productId,
                inventory_batch_id: batch.id,
                source_type: "fifo",
                qty: takeQty,
                dp_price: dpPrice,
                cost_amount: takeQty * dpPrice,
                created_by: user.userId,
            },
        });
        totalCost += takeQty * dpPrice;
        remaining -= takeQty;

        await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { remaining_qty: batch.remaining_qty - takeQty },
        });
    }

    if (remaining > 0) {
        await tx.saleItemCostLayer.create({
            data: {
                owner_id: user.ownerId,
                sale_id: input.saleId,
                sale_item_id: input.saleItemId,
                product_id: input.productId,
                inventory_batch_id: null,
                source_type: "preorder",
                qty: remaining,
                dp_price: input.fallbackCost,
                cost_amount: remaining * input.fallbackCost,
                created_by: user.userId,
            },
        });
        totalCost += remaining * input.fallbackCost;
    }

    await updateSaleItemAverageCost(tx, input.saleItemId);

    return totalCost / qty;
};

// Return consumed quantities to their batches and drop the item's layers
// (used before deleting or re-pricing a sale item).
export const releaseFifoForSaleItem = async (tx: Tx, saleItemId: string) => {
    if (!saleItemId) return;

    const layers = await tx.saleItemCostLayer.findMany({
        where: { sale_item_id: saleItemId },
        select: { id: true, inventory_batch_id: true, source_type: true, qty: true },
    });

    for (const layer of layers) {
        if (layer.inventory_batch_id && (layer.source_type === "fifo" || layer.source_type === "manual")) {
            await tx.inventoryBatch.update({
                where: { id: layer.inventory_batch_id },
                data: { remaining_qty: { increment: layer.qty } },
            });
        }
    }

    await tx.saleItemCostLayer.deleteMany({ where: { sale_item_id: saleItemId } });
};

// Adjust the inventory level and write a history row in one step.
export const adjustInventoryLevel = async (
    tx: Tx,
    input: {
        productId: string;
        productName: string;
        qtyChange: number;
        upcomingChange?: number;
        changeType: "purchase_in" | "sales_out" | "transfer_in" | "transfer_out" | "adjustment";
        referenceId?: string | null;
        referenceType?: string;
        notes?: string;
    },
    user: IRequestUser
) => {
    const inventory = await tx.inventory.upsert({
        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: input.productId } },
        create: {
            owner_id: user.ownerId,
            product_id: input.productId,
            available_qty: input.qtyChange,
            upcoming_qty: Math.max(0, input.upcomingChange ?? 0),
        },
        update: {
            available_qty: { increment: input.qtyChange },
            ...(input.upcomingChange
                ? { upcoming_qty: { increment: input.upcomingChange } }
                : {}),
        },
    });

    await tx.inventoryHistory.create({
        data: {
            owner_id: user.ownerId,
            product_id: input.productId,
            product_name: input.productName,
            change_type: input.changeType,
            qty_change: input.qtyChange,
            qty_before: inventory.available_qty - input.qtyChange,
            qty_after: inventory.available_qty,
            reference_id: input.referenceId ?? null,
            reference_type: input.referenceType ?? "",
            notes: input.notes ?? "",
            created_by: user.userId,
        },
    });

    return inventory;
};

/**
 * Take `qty` units off a product's FIFO batches and report what they cost.
 *
 * The gap this fills: consumeFifoForSaleItem can only be used by a sale - it
 * demands a sale_id and writes sale_item_cost_layers - and the negative branch
 * of adjustInventory walks the batches inline and throws the cost away. So
 * anything that is not a sale could move stock but never value it.
 *
 * No cost layer is written here. A layer exists to explain what a SALE cost;
 * stock destroyed or sent away was never sold, and inventing a layer for it
 * would put rows in sale_item_cost_layers with no sale to belong to.
 *
 * The arithmetic is planBatchDraw in shared/batchDraw.ts, where it is tested.
 * This only applies the plan. A shortfall is reported, not refused: stock is
 * allowed to go negative here.
 */
export const drawStockFifo = async (
    tx: Tx,
    input: { productId: string; qty: number },
    user: IRequestUser
) => {
    const batches = await tx.inventoryBatch.findMany({
        where: { owner_id: user.ownerId, product_id: input.productId, remaining_qty: { gt: 0 } },
        orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
        select: { id: true, remaining_qty: true, dp_price: true },
    });

    const plan = planBatchDraw(batches, input.qty);

    for (const take of plan.takes) {
        await tx.inventoryBatch.update({
            where: { id: take.batchId },
            data: { remaining_qty: { decrement: take.qty } },
        });
    }

    return plan;
};

/**
 * Put stock back as its own batch, at a cost the caller already knows.
 *
 * createReceiveStockBatch cannot be used for this: it hardcodes
 * source_type "purchase_receive" and wants a purchase_item_id, and a repaired
 * chair belongs to no purchase line. `adjustment` is the same source_type the
 * manual stock correction uses for a positive change.
 *
 * settlePendingPreorderCosts is called for the same reason the purchase path
 * calls it - if this product was sold while out of stock, those sales are
 * sitting on preorder layers with a guessed cost, and this batch is the first
 * real price available to settle them against.
 */
export const returnStockBatch = async (
    tx: Tx,
    input: { productId: string; qty: number; dpPrice: number; mrpPrice: number; receivedDate: Date },
    user: IRequestUser
) => {
    if (!input.productId || input.qty <= 0) return null;

    const batch = await tx.inventoryBatch.create({
        data: {
            owner_id: user.ownerId,
            product_id: input.productId,
            source_type: "adjustment",
            received_qty: input.qty,
            remaining_qty: input.qty,
            dp_price: input.dpPrice,
            mrp_price: input.mrpPrice,
            received_date: input.receivedDate,
            created_by: user.userId,
        },
    });

    await settlePendingPreorderCosts(tx, batch, user);
    return batch;
};

/**
 * Put a damaged line's stock back on the exact batches it came off.
 *
 * The mirror of releaseFifoForSaleItem, and needed for the same reason: an
 * entry that is deleted must leave the batch table as it found it. Restoring
 * the quantity as a fresh batch instead would keep the total right while
 * quietly shifting FIFO order, which is the kind of drift that makes a cost
 * figure stop being trustworthy a year later.
 *
 * Layers with no inventory_batch_id are the shortfall - there was no batch to
 * take from, so there is none to give back to.
 */
export const releaseDamageCostLayers = async (tx: Tx, damageItemId: string) => {
    const layers = await tx.damageCostLayer.findMany({
        where: { damage_item_id: damageItemId },
        select: { id: true, inventory_batch_id: true, qty: true },
    });

    for (const layer of layers) {
        if (!layer.inventory_batch_id || layer.qty <= 0) continue;
        await tx.inventoryBatch.update({
            where: { id: layer.inventory_batch_id },
            data: { remaining_qty: { increment: layer.qty } },
        });
    }

    await tx.damageCostLayer.deleteMany({ where: { damage_item_id: damageItemId } });
};
