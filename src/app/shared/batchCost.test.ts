import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openingStockCost, purchaseReceiveCost, verdictFor } from "./batchCost.js";

// This decides what a one-shot repair script writes into a live database, so
// the cases that must NOT be touched matter more than the ones that must. A
// false positive here reprices a batch that was genuinely bought at that rate,
// and nothing on any screen would say so afterwards.

describe("openingStockCost", () => {
    it("takes the DP discount off the list price", () => {
        assert.equal(openingStockCost({ cost_price: 11_400, dp_discount: 10 }), 10_260);
    });

    it("is the list price when nothing was negotiated", () => {
        assert.equal(openingStockCost({ cost_price: 11_400, dp_discount: 0 }), 11_400);
        assert.equal(openingStockCost({ cost_price: 11_400 }), 11_400);
    });
});

describe("purchaseReceiveCost", () => {
    it("trusts actual_dp when the purchase form filled it in", () => {
        assert.equal(purchaseReceiveCost({ actual_dp: 10_260, dp_price: 11_400, discount_pct: 10 }), 10_260);
    });

    it("derives it when actual_dp was left at its zero default", () => {
        // The gap that put list prices into purchase-receive batches: the column
        // is optional in the Zod schema and defaults to 0, and the old code read
        // `actual_dp || dp_price` - so a missing figure meant the list rate.
        assert.equal(purchaseReceiveCost({ actual_dp: 0, dp_price: 11_400, discount_pct: 10 }), 10_260);
        assert.equal(purchaseReceiveCost({ dp_price: 11_400, discount_pct: 10 }), 10_260);
    });

    it("is the list price when there was no discount either way", () => {
        assert.equal(purchaseReceiveCost({ actual_dp: 0, dp_price: 11_400, discount_pct: 0 }), 11_400);
    });
});

describe("verdictFor", () => {
    it("reprices a batch still holding the list rate", () => {
        assert.deepEqual(
            verdictFor({ current: 11_400, listPrice: 11_400, correct: 10_260 }),
            { reprice: true, from: 11_400, to: 10_260 }
        );
    });

    it("catches a list price carrying paisa", () => {
        // The exact-match query this replaces compared a rounded figure against
        // the stored Decimal, so a product listed at 11400.50 was skipped in
        // silence and its sales kept the wrong cost.
        assert.deepEqual(
            verdictFor({ current: 11_400.5, listPrice: 11_400.5, correct: 10_260 }),
            { reprice: true, from: 11_401, to: 10_260 }
        );
    });

    it("leaves a batch that was genuinely bought at another price", () => {
        // Prices move, and a batch keeps what it cost. 10,800 is neither the
        // list rate nor the discounted one, so nothing here knows better.
        assert.equal(
            verdictFor({ current: 10_800, listPrice: 11_400, correct: 10_260 }).reprice,
            false
        );
    });

    it("leaves a batch that is already correct, so a second run does nothing", () => {
        assert.deepEqual(
            verdictFor({ current: 10_260, listPrice: 11_400, correct: 10_260 }),
            { reprice: false, reason: "already correct" }
        );
    });

    it("leaves everything alone when there is no discount to apply", () => {
        assert.deepEqual(
            verdictFor({ current: 11_400, listPrice: 11_400, correct: 11_400 }),
            { reprice: false, reason: "no discount" }
        );
    });

    it("never raises a price", () => {
        // The bug only ever overstated a cost. A rule that could increase one
        // would be repairing something this script has no evidence about.
        for (const correct of [11_400, 12_000, 99_999]) {
            assert.equal(verdictFor({ current: 11_400, listPrice: 11_400, correct }).reprice, false);
        }
    });
});
