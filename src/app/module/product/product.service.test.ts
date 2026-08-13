import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planPriceChange } from "./product.service.js";

// A monthly price file arrives from a supplier and is applied to hundreds of
// products at once, so the cost of getting this wrong is a catalogue full of
// wrong prices that nobody notices until something sells. These pin down the
// two rules that keep that from happening.

const current = {
    cost_price: 1000,
    selling_price: 1500,
    dp_discount: 10,
    mrp_discount: 5,
};

describe("planPriceChange", () => {
    it("writes only the prices the row actually carries", () => {
        const plan = planPriceChange(current, { cost_price: 1200 });
        assert.deepEqual(plan.data, { cost_price: 1200 });
        assert.equal(plan.changed, true);
    });

    it("leaves a price alone when the cell was blank", () => {
        // The parser hands back undefined for an empty cell. Reading that as 0
        // would set the price to zero on every row the supplier left out.
        const plan = planPriceChange(current, { cost_price: 1200, selling_price: undefined });
        assert.equal("selling_price" in plan.data, false);
        assert.equal(plan.after.selling_price, 1500);
    });

    it("still writes an explicit zero", () => {
        // Blank means "not changing"; a typed 0 is a real instruction.
        const plan = planPriceChange(current, { dp_discount: 0 });
        assert.deepEqual(plan.data, { dp_discount: 0 });
        assert.equal(plan.changed, true);
    });

    it("reports no change when the file repeats what is already stored", () => {
        const plan = planPriceChange(current, { cost_price: 1000, selling_price: 1500 });
        assert.deepEqual(plan.data, {});
        assert.equal(plan.changed, false);
    });

    it("reports no change for a row with no prices at all", () => {
        const plan = planPriceChange(current, {});
        assert.equal(plan.changed, false);
    });

    it("keeps the old values in `before` so a rollback file can be written", () => {
        const plan = planPriceChange(current, { cost_price: 1200, mrp_discount: 8 });
        assert.deepEqual(plan.before, { cost_price: 1000, mrp_discount: 5 });
        assert.deepEqual(plan.after, {
            cost_price: 1200,
            selling_price: 1500,
            dp_discount: 10,
            mrp_discount: 8,
        });
    });

    it("never reports a field the caller did not send", () => {
        // The payload schema already refuses anything but the four prices; this
        // is the second half of that guarantee.
        const plan = planPriceChange(current, { name: "Renamed", opening_qty: 99, cost_price: 1200 } as never);
        assert.deepEqual(Object.keys(plan.data), ["cost_price"]);
    });
});
