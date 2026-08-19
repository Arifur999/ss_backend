import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasLiveAccess, planSelectionFields } from "./planSelection.js";

// The helper hands back a loose bag of columns; these are the few this file
// reads out of it.
type DatedFields = { expiry_date: Date; active_until: Date; plan: string; plan_status: string; trial_used: boolean };
const dated = (fields: Record<string, unknown>) => fields as unknown as DatedFields;

const NOW = new Date("2026-08-19T05:30:00.000Z");
const tomorrow = new Date("2026-08-20T05:30:00.000Z");
const yesterday = new Date("2026-08-18T05:30:00.000Z");

describe("choosing a plan", () => {
    it("does not touch a live trial when a paid plan is picked", () => {
        // The reported bug: an owner with one day of trial left clicked
        // "Choose Monthly" - which only opens the bKash checkout, charges
        // nothing and creates no payment row - and was locked out on the spot,
        // their remaining day gone.
        const trialWithADayLeft = { plan_status: "active", expiry_date: tomorrow, trial_used: true };
        assert.deepEqual(planSelectionFields("monthly", trialWithADayLeft, NOW), {});
        assert.deepEqual(planSelectionFields("yearly", trialWithADayLeft, NOW), {});
    });

    it("does not touch a live paid plan either - renewing early must not cost you the rest of the month", () => {
        const monthlyWithTimeLeft = { plan_status: "active", expiry_date: new Date("2026-09-19T00:00:00.000Z"), trial_used: true };
        assert.deepEqual(planSelectionFields("yearly", monthlyWithTimeLeft, NOW), {});
    });

    it("still keeps an already-expired owner locked out - that gating is the point", () => {
        const expired = { plan_status: "expired", expiry_date: yesterday, trial_used: true };
        const fields = planSelectionFields("monthly", expired, NOW) as Record<string, unknown>;
        assert.equal(fields.plan_status, "expired");
        assert.equal(fields.plan_type, "monthly");
        assert.equal(fields.plan, "Starter");
    });

    it("dates a monthly selection a month out and a yearly one a year", () => {
        const expired = { plan_status: "expired", expiry_date: yesterday };
        const monthly = dated(planSelectionFields("monthly", expired, NOW));
        const yearly = dated(planSelectionFields("yearly", expired, NOW));
        assert.equal(monthly.expiry_date.toISOString(), "2026-09-19T05:30:00.000Z");
        assert.equal(yearly.expiry_date.toISOString(), "2027-08-19T05:30:00.000Z");
        assert.equal(yearly.plan, "Enterprise");
    });

    it("starts the free trial immediately, for seven days", () => {
        const fresh = { plan_status: "expired", expiry_date: null, trial_used: false };
        const fields = dated(planSelectionFields("free_trial", fresh, NOW));
        assert.equal(fields.plan_status, "active");
        assert.equal(fields.trial_used, true);
        assert.equal(fields.expiry_date.toISOString(), "2026-08-26T05:30:00.000Z");
        assert.equal(fields.active_until.toISOString(), "2026-08-26T05:30:00.000Z");
    });

    it("treats a plan marked active but already past its date as expired", () => {
        // The record that started this: plan_status said one thing and the
        // date said another. Whichever way it disagrees, the date decides
        // whether there is access left to protect.
        const stale = { plan_status: "active", expiry_date: yesterday };
        assert.equal(hasLiveAccess(stale, NOW), false);
        assert.notDeepEqual(planSelectionFields("monthly", stale, NOW), {});
    });

    it("treats a missing expiry date as no access", () => {
        assert.equal(hasLiveAccess({ plan_status: "active", expiry_date: null }, NOW), false);
    });

    it("never counts a suspended owner as having access", () => {
        assert.equal(hasLiveAccess({ plan_status: "suspended", expiry_date: tomorrow }, NOW), false);
    });
});
