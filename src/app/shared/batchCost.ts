import { actualDp, roundTaka } from "./money.js";

// ---------------------------------------------------------------------------
// What a stock batch SHOULD have cost, and whether the one on record is wrong.
//
// A FIFO batch is what every sale is costed against, so its dp_price decides
// the Purchase Amount and the profit on every invoice that draws from it. Two
// paths used to write the list price into that field instead of the discounted
// one, and each made the same class of mistake:
//
//   opening stock      priced at product.cost_price, ignoring dp_discount
//   purchase receive   priced at purchase_item.dp_price whenever actual_dp was
//                      left at its 0 default, ignoring discount_pct
//
// Both are fixed at the point of writing now. This module is how the repair
// script decides which rows already on the books are still wrong - kept pure
// and apart from the script so the decision can be tested, because the script
// runs once against a live database and a wrong rule there is very expensive.
// ---------------------------------------------------------------------------

/** What an opening-stock batch should cost per unit. */
export const openingStockCost = (product: { cost_price?: unknown; dp_discount?: unknown }): number =>
    actualDp(product.cost_price, product.dp_discount);

/**
 * What a purchase-receive batch should cost per unit.
 *
 * actual_dp is the figure the purchase form computes and is authoritative when
 * it is there. It defaults to 0 and the Zod schema marks it optional, so a row
 * saved without it falls back to deriving the same number from the list price
 * and the percentage - which is what createReceiveStockBatch should have done
 * rather than taking the list price whole.
 */
export const purchaseReceiveCost = (item: {
    actual_dp?: unknown;
    dp_price?: unknown;
    discount_pct?: unknown;
}): number => {
    const stated = roundTaka(item.actual_dp);
    if (stated > 0) return stated;
    return actualDp(item.dp_price, item.discount_pct);
};

export type RepriceVerdict =
    | { reprice: false; reason: "already correct" | "no discount" | "price is not the list rate" }
    | { reprice: true; from: number; to: number };

/**
 * Whether a batch on record should be repriced, and to what.
 *
 * Deliberately narrow. It only acts when the stored price is EXACTLY the list
 * rate - compared as whole taka, so a batch holding 11400.50 against a list of
 * 11400.50 is still caught - and the discount says it should have been less.
 *
 * Anything else is left alone, which is what makes the script safe to run and
 * safe to re-run: a batch genuinely received at a different price from the
 * current list (prices change, and an old batch keeps what it cost) does not
 * match, and a batch already repaired no longer matches either.
 */
export const verdictFor = (input: {
    /** What the batch currently holds. */
    current: unknown;
    /** The undiscounted rate it would have been given by the old code. */
    listPrice: unknown;
    /** What it should cost, from openingStockCost / purchaseReceiveCost. */
    correct: unknown;
}): RepriceVerdict => {
    const current = roundTaka(input.current);
    const list = roundTaka(input.listPrice);
    const correct = roundTaka(input.correct);

    if (correct >= list) return { reprice: false, reason: "no discount" };
    if (current === correct) return { reprice: false, reason: "already correct" };
    if (current !== list) return { reprice: false, reason: "price is not the list rate" };

    return { reprice: true, from: current, to: correct };
};
