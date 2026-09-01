import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actualDp, roundTaka } from "./money.js";

// The server derives a purchase cost from the product's list DP and discount;
// the browser derives the same figure for a preorder line and for the Product
// List's "Final DP" column. These cases are lifted from the frontend's
// purchaseAmounts.test.ts on purpose: if the two rules ever drift, a sale's
// cost would depend on which side computed it.

describe("actualDp", () => {
    it("takes the discount percentage off the DP", () => {
        assert.equal(actualDp(1_000, 10), 900);
        assert.equal(actualDp(1_000, 0), 1_000);
    });

    it("prices the product from the screenshots at its discounted DP", () => {
        // Tk 11,400 list, 10% off - the Sales Ledger was recording 11,400.
        assert.equal(actualDp(11_400, 10), 10_260);
    });

    it("rounds the unit price so the line total stays whole", () => {
        // 7% off Tk 1,050 is 976.50 - the paisa nothing should store.
        assert.equal(actualDp(1_050, 7), 977);
        assert.equal(actualDp(1_050, 7) * 4, 3_908);
    });

    it("rounds an exact half up despite floating point", () => {
        // Why it subtracts rather than multiplying by (1 - pct/100): written
        // that way 1050 * 0.93 is 976.4999999999999 and rounds DOWN.
        assert.ok(1_050 * (1 - 7 / 100) < 976.5);

        for (const [dp, pct, expected] of [
            [1_050, 7, 977],
            [150, 7, 140],
            [1_500, 5.1, 1_424],
            [4_050, 21, 3_200],
        ] as const) {
            assert.equal(actualDp(dp, pct), expected);
        }
    });

    it("handles a full discount and a missing percentage", () => {
        assert.equal(actualDp(1_000, 100), 0);
        assert.equal(actualDp(1_000, null), 1_000);
        assert.equal(actualDp(null, 10), 0);
        // A Prisma Decimal arrives as an object; Number() on it is the value.
        assert.equal(actualDp({ toString: () => "11400" }, "10"), 10_260);
    });

    it("agrees with roundTaka on a discount of nothing", () => {
        assert.equal(actualDp(105.9, 0), roundTaka(105.9));
    });
});
