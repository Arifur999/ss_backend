import { roundTaka } from "./money.js";

// ---------------------------------------------------------------------------
// Taking stock out of FIFO batches, and knowing what it cost.
//
// There is no helper for this. consumeFifoForSaleItem is sale-item shaped - it
// demands a sale_id and a sale_item_id and writes sale_item_cost_layers - so
// nothing that is not a sale can use it. The negative branch of
// adjustInventory re-implements the batch walk inline and then discards the
// cost entirely, which is exactly why damaging five chairs could be counted
// but never valued.
//
// The walk itself is arithmetic, so it lives here where it can be tested: the
// backend's tests run in CI with no .env, and anything reaching config/env.ts
// fails there. fifo.helpers.ts applies the plan this returns.
// ---------------------------------------------------------------------------

/** One batch, as much of it as this module needs to know. */
export interface DrawableBatch {
    id: string;
    remaining_qty: unknown;
    dp_price: unknown;
}

/** How much to take off one batch, and what that much is worth. */
export interface BatchTake {
    batchId: string;
    qty: number;
    dpPrice: number;
}

export interface BatchDrawPlan {
    /** In the order the batches were given, which is the order they must be written. */
    takes: BatchTake[];
    /** How many units the batches could actually supply. */
    drawn: number;
    /**
     * What was asked for and was not there.
     *
     * Not an error. Stock is allowed to go negative - the app sells on preorder
     * - so a shop can genuinely damage a piece the batch table does not have,
     * and refusing the entry would leave the breakage unrecorded.
     */
    shortfall: number;
    /** What came off the batches - the figure the inventory really lost. */
    drawnCost: number;
    /** Weighted average over what was drawn. Zero when nothing was. */
    unitCost: number;
    /**
     * unitCost x the full quantity asked for.
     *
     * So a shortfall is valued at the same rate as the stock that WAS there,
     * which is the best estimate available and keeps the line's total honest
     * against its own quantity. When nothing could be drawn at all this is 0
     * and the caller has no basis to invent one.
     */
    totalCost: number;
}

/**
 * Plan a draw of `qty` units across `batches`, oldest first.
 *
 * The caller passes the batches already ordered the way FIFO wants them
 * (received_date asc, created_at asc) - the same order the rest of the app
 * consumes in. This does not reorder them, so there is exactly one place that
 * decides what "oldest" means.
 */
export const planBatchDraw = (batches: DrawableBatch[], qty: unknown): BatchDrawPlan => {
    const wanted = Math.max(0, Math.trunc(Number(qty) || 0));

    const takes: BatchTake[] = [];
    let remaining = wanted;
    let drawn = 0;
    let drawnCost = 0;

    for (const batch of batches) {
        if (remaining <= 0) break;
        const available = Math.max(0, Math.trunc(Number(batch.remaining_qty) || 0));
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        const dpPrice = roundTaka(batch.dp_price);

        takes.push({ batchId: batch.id, qty: take, dpPrice });
        drawnCost += take * dpPrice;
        drawn += take;
        remaining -= take;
    }

    const unitCost = drawn > 0 ? roundTaka(drawnCost / drawn) : 0;

    return {
        takes,
        drawn,
        shortfall: wanted - drawn,
        drawnCost: roundTaka(drawnCost),
        unitCost,
        totalCost: roundTaka(unitCost * wanted),
    };
};
