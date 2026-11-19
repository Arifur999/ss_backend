import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commissionValue, coversMonth, monthsInPeriod, targetProgress } from "./supplierCommission.js";

describe("commissionValue", () => {
    it("takes a percent of the target", () => {
        assert.equal(commissionValue({ target: 400_000, rule: "percent", value: 3 }), 12_000);
    });

    /**
     * The reason a percent rule reads off the target rather than off what has
     * been bought.
     *
     * The page promises "buy 40,000 more to earn 12,000". That sentence is only
     * sayable while the 12,000 holds still. Off the running total it would
     * creep up with every bill entered and could never be promised in advance.
     */
    it("does not move as the buying grows", () => {
        const terms = { target: 400_000, rule: "percent" as const, value: 3 };
        assert.equal(commissionValue(terms), 12_000);
        // Nothing about buying enters this function at all - that is the point.
        assert.equal(targetProgress(terms, 100_000).commission, 12_000);
        assert.equal(targetProgress(terms, 900_000).commission, 12_000);
    });

    it("pays a fixed rule its own figure, whatever the target", () => {
        assert.equal(commissionValue({ target: 400_000, rule: "fixed", value: 5_000 }), 5_000);
        assert.equal(commissionValue({ target: 50_000, rule: "fixed", value: 5_000 }), 5_000);
    });

    it("pays nothing when there is no rule", () => {
        assert.equal(commissionValue({ target: 400_000, rule: "none", value: 3 }), 0);
        assert.equal(commissionValue({ target: 400_000, rule: null, value: 3 }), 0);
        assert.equal(commissionValue({ target: 400_000, rule: undefined, value: 3 }), 0);
    });

    it("pays nothing on a target of zero", () => {
        // A goal nobody has to reach is not an agreement, and paying out on it
        // would turn every blank target into money.
        assert.equal(commissionValue({ target: 0, rule: "percent", value: 3 }), 0);
        assert.equal(commissionValue({ target: 0, rule: "fixed", value: 5_000 }), 0);
    });

    it("pays nothing on a rule worth nothing", () => {
        assert.equal(commissionValue({ target: 400_000, rule: "percent", value: 0 }), 0);
        assert.equal(commissionValue({ target: 400_000, rule: "fixed", value: -100 }), 0);
    });

    it("rounds to the taka and paisa, not to a long decimal", () => {
        assert.equal(commissionValue({ target: 33_333, rule: "percent", value: 3.5 }), 1_166.66);
    });
});

describe("targetProgress", () => {
    const terms = { target: 400_000, rule: "percent" as const, value: 3 };

    it("says what is left while the target is unmet", () => {
        const at = targetProgress(terms, 360_000);
        assert.equal(at.met, false);
        assert.equal(at.remaining, 40_000);
        assert.equal(at.percent, 90);
        assert.equal(at.commission, 12_000);
    });

    it("meets the target exactly on the number", () => {
        const at = targetProgress(terms, 400_000);
        assert.equal(at.met, true);
        assert.equal(at.remaining, 0);
    });

    it("leaves nothing remaining once past it", () => {
        const at = targetProgress(terms, 450_000);
        assert.equal(at.met, true);
        assert.equal(at.remaining, 0);
    });

    it("clamps the bar at a hundred", () => {
        // A progress bar past its own end reads as a rendering fault rather
        // than as good news; the figure beside it says how far over it went.
        assert.equal(targetProgress(terms, 800_000).percent, 100);
    });

    it("never reports a negative bar", () => {
        assert.equal(targetProgress(terms, -50_000).percent, 0);
    });

    it("is never met when there is no target", () => {
        const none = targetProgress({ target: 0, rule: "percent", value: 3 }, 90_000);
        assert.equal(none.met, false);
        assert.equal(none.percent, 0);
        assert.equal(none.remaining, 0);
    });
});

describe("monthsInPeriod", () => {
    it("counts both ends", () => {
        assert.equal(monthsInPeriod({ start_year: 2026, start_month: 1, end_year: 2026, end_month: 12 }), 12);
        assert.equal(monthsInPeriod({ start_year: 2026, start_month: 3, end_year: 2026, end_month: 3 }), 1);
    });

    it("counts across a year boundary", () => {
        assert.equal(monthsInPeriod({ start_year: 2026, start_month: 11, end_year: 2027, end_month: 2 }), 4);
    });

    it("never returns less than one", () => {
        // A period that ends before it starts is a typo, not a request for a
        // negative number of months. The validation refuses it at the edge.
        assert.equal(monthsInPeriod({ start_year: 2026, start_month: 6, end_year: 2026, end_month: 1 }), 1);
    });
});

describe("coversMonth", () => {
    const period = { start_year: 2026, start_month: 4, end_year: 2026, end_month: 9 };

    it("includes both ends", () => {
        assert.equal(coversMonth(period, 2026, 4), true);
        assert.equal(coversMonth(period, 2026, 9), true);
    });

    it("excludes the months either side", () => {
        assert.equal(coversMonth(period, 2026, 3), false);
        assert.equal(coversMonth(period, 2026, 10), false);
    });

    it("does not confuse a month number across years", () => {
        // The comparison is year*12+month, not month alone, so June 2025 is not
        // inside an April-to-September 2026 period.
        assert.equal(coversMonth(period, 2025, 6), false);
        assert.equal(coversMonth(period, 2027, 6), false);
    });
});
