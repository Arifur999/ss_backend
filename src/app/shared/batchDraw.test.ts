import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { planBatchDraw, type DrawableBatch } from "./batchDraw.js";

// Damaging stock has to know what the stock cost, and nothing in the app could
// tell it: consumeFifoForSaleItem only works for a sale, and adjustInventory
// walks the batches and throws the cost away. These pin the walk.

const batch = (id: string, remaining_qty: unknown, dp_price: unknown): DrawableBatch =>
    ({ id, remaining_qty, dp_price });

describe("planBatchDraw", () => {
    test("takes from one batch when one batch is enough", () => {
        const plan = planBatchDraw([batch("a", 5, 17_370)], 2);
        assert.deepEqual(plan.takes, [{ batchId: "a", qty: 2, dpPrice: 17_370 }]);
        assert.equal(plan.drawn, 2);
        assert.equal(plan.shortfall, 0);
        assert.equal(plan.unitCost, 17_370);
        assert.equal(plan.totalCost, 34_740);
    });

    test("spills into the next batch, oldest first, and weights the cost", () => {
        // Two bought at 10,000 and the rest at 12,000: damaging three costs
        // 10,000 + 10,000 + 12,000 = 32,000, so 10,667 each.
        const plan = planBatchDraw([batch("old", 2, 10_000), batch("new", 5, 12_000)], 3);
        assert.deepEqual(plan.takes, [
            { batchId: "old", qty: 2, dpPrice: 10_000 },
            { batchId: "new", qty: 1, dpPrice: 12_000 },
        ]);
        assert.equal(plan.drawnCost, 32_000);
        assert.equal(plan.unitCost, 10_667);
        assert.equal(plan.drawn, 3);
    });

    test("stops at the quantity asked for, leaving later batches untouched", () => {
        const plan = planBatchDraw([batch("a", 10, 500), batch("b", 10, 900)], 4);
        assert.equal(plan.takes.length, 1);
        assert.equal(plan.takes[0].qty, 4);
    });

    test("skips an empty batch rather than emitting a zero take", () => {
        const plan = planBatchDraw([batch("spent", 0, 9_000), batch("live", 3, 8_000)], 2);
        assert.deepEqual(plan.takes, [{ batchId: "live", qty: 2, dpPrice: 8_000 }]);
    });

    // Stock is allowed to go negative - the app sells on preorder - so damaging
    // more than the batches hold is a real case, and refusing it would leave
    // the breakage unrecorded.
    test("reports a shortfall instead of refusing", () => {
        const plan = planBatchDraw([batch("a", 1, 17_370)], 3);
        assert.equal(plan.drawn, 1);
        assert.equal(plan.shortfall, 2);
        assert.equal(plan.drawnCost, 17_370);
    });

    test("values a shortfall at the rate of the stock that was there", () => {
        const plan = planBatchDraw([batch("a", 1, 17_370)], 3);
        assert.equal(plan.unitCost, 17_370);
        assert.equal(plan.totalCost, 52_110);
    });

    test("invents no price when there is no stock at all to learn one from", () => {
        const plan = planBatchDraw([], 2);
        assert.deepEqual(plan.takes, []);
        assert.equal(plan.drawn, 0);
        assert.equal(plan.shortfall, 2);
        assert.equal(plan.unitCost, 0);
        assert.equal(plan.totalCost, 0);
    });

    test("rounds the weighted average to the taka, like every other figure", () => {
        // 10,000 + 10,001 over two units is 10,000.5.
        const plan = planBatchDraw([batch("a", 1, 10_000), batch("b", 1, 10_001)], 2);
        assert.equal(plan.unitCost, 10_001);
        assert.equal(plan.drawnCost, 20_001);
    });

    test("takes Decimal-ish and string inputs, as Prisma hands them over", () => {
        const plan = planBatchDraw([batch("a", "4", "12780.00")], 2);
        assert.equal(plan.takes[0].dpPrice, 12_780);
        assert.equal(plan.totalCost, 25_560);
    });

    test("a zero or nonsense quantity draws nothing", () => {
        assert.equal(planBatchDraw([batch("a", 5, 100)], 0).drawn, 0);
        assert.equal(planBatchDraw([batch("a", 5, 100)], -3).takes.length, 0);
        assert.equal(planBatchDraw([batch("a", 5, 100)], undefined).drawn, 0);
    });

    test("never takes more than a batch holds", () => {
        const plan = planBatchDraw([batch("a", 2, 100), batch("b", 2, 100)], 10);
        assert.equal(plan.takes.every((take) => take.qty <= 2), true);
        assert.equal(plan.drawn, 4);
        assert.equal(plan.shortfall, 6);
    });
});
