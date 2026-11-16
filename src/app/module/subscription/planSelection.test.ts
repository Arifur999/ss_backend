import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRIAL_DAYS, hasLiveAccess, planSelectionFields, trialRefusal } from "./planSelection.js";

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
        assert.deepEqual(planSelectionFields("monthly", trialWithADayLeft, NOW), { pending_plan_type: "monthly" });
        assert.deepEqual(planSelectionFields("yearly", trialWithADayLeft, NOW), { pending_plan_type: "yearly" });
    });

    it("does not touch a live paid plan either - renewing early must not cost you the rest of the month", () => {
        const monthlyWithTimeLeft = { plan_status: "active", expiry_date: new Date("2026-09-19T00:00:00.000Z"), trial_used: true };
        assert.deepEqual(planSelectionFields("yearly", monthlyWithTimeLeft, NOW), { pending_plan_type: "yearly" });
    });

    /**
     * The second reported bug, and the reason pending_plan_type exists.
     *
     * Opening a checkout must not announce a plan. The Current Plan page reads
     * plan_type and expiry_date, so writing them here put "Starter, expires in
     * a month" on screen for somebody who had paid nothing and been approved by
     * nobody.
     */
    it("records only which plan is being bought - no plan, no dates, no status", () => {
        const expired = { plan_status: "expired", expiry_date: yesterday, trial_used: true };
        const fields = planSelectionFields("monthly", expired, NOW) as Record<string, unknown>;
        // Named one by one, because these four are exactly what used to be
        // written here and what put a plan nobody owned on the screen.
        assert.equal(fields.plan, undefined);
        assert.equal(fields.plan_type, undefined);
        assert.equal(fields.expiry_date, undefined);
        assert.equal(fields.plan_status, undefined);
        // And nothing else either. deepEqual under node:assert/strict is exact.
        assert.deepEqual(fields, { pending_plan_type: "monthly" });
    });

    it("leaves an already-expired owner exactly as locked out as they were", () => {
        // The gating still works, and now by doing nothing rather than by
        // rewriting the row to a differently-expired state.
        const expired = { plan_status: "expired", expiry_date: yesterday, trial_used: true };
        const fields = planSelectionFields("yearly", expired, NOW) as Record<string, unknown>;
        assert.equal(fields.plan_status, undefined);
        assert.equal(hasLiveAccess(expired, NOW), false);
    });

    it("starts the free trial immediately, for the full trial length", () => {
        const fresh = { plan_status: "expired", expiry_date: null, trial_used: false };
        const fields = dated(planSelectionFields("free_trial", fresh, NOW));
        assert.equal(fields.plan_status, "active");
        assert.equal(fields.trial_used, true);
        // NOW + TRIAL_DAYS, so the assertion follows the constant rather than
        // pinning a date somebody would have to recompute by hand.
        const expected = new Date(NOW.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        assert.equal(fields.expiry_date.toISOString(), expected);
        assert.equal(fields.active_until.toISOString(), expected);
    });

    it("runs the trial for fourteen days", () => {
        // Spelled out as well as derived: if somebody changes TRIAL_DAYS, the
        // test above still passes and this one says what moved.
        assert.equal(TRIAL_DAYS, 14);
        const fields = dated(planSelectionFields("free_trial", { trial_used: false }, NOW));
        assert.equal(fields.expiry_date.toISOString(), "2026-09-02T05:30:00.000Z");
    });

    it("clears a half-finished checkout when the trial is started instead", () => {
        const fields = planSelectionFields("free_trial", { trial_used: false }, NOW) as Record<string, unknown>;
        assert.equal(fields.pending_plan_type, null);
    });

    it("treats a plan marked active but already past its date as expired", () => {
        // The record that started this: plan_status said one thing and the
        // date said another. Whichever way it disagrees, the date decides
        // whether there is access left to protect.
        const stale = { plan_status: "active", expiry_date: yesterday };
        assert.equal(hasLiveAccess(stale, NOW), false);
    });

    it("treats a missing expiry date as no access", () => {
        assert.equal(hasLiveAccess({ plan_status: "active", expiry_date: null }, NOW), false);
    });

    it("never counts a suspended owner as having access", () => {
        assert.equal(hasLiveAccess({ plan_status: "suspended", expiry_date: tomorrow }, NOW), false);
    });
});

describe("who may start the free trial", () => {
    const fresh = { status: "expired", plan_status: "expired", plan_type: "free_trial", trial_used: false };

    it("lets a new registration start it", () => {
        assert.equal(trialRefusal(fresh, NOW), null);
    });

    /**
     * The first reported bug.
     *
     * Somebody looked at the monthly price, paid nothing, came back to the free
     * trial and was told it had already been used. It never had been - the old
     * check read plan_type, and choosePlan wrote "monthly" into it the moment
     * the checkout opened. Selecting is not owning.
     */
    it("still offers the trial to somebody who opened a paid checkout and did not pay", () => {
        const openedCheckout = { ...fresh, status: "pending", plan_type: "monthly", plan_status: "expired" };
        assert.equal(trialRefusal(openedCheckout, NOW), null);
        assert.equal(trialRefusal({ ...openedCheckout, plan_type: "yearly" }, NOW), null);
    });

    it("still offers it after a payment was submitted but not yet approved", () => {
        // Awaiting approval is not owning either. Only the super admin's
        // approval makes a paid plan real.
        const awaitingApproval = { ...fresh, status: "pending", plan_type: "monthly", plan_status: "expired", expiry_date: yesterday };
        assert.equal(trialRefusal(awaitingApproval, NOW), null);
    });

    it("runs once", () => {
        assert.equal(trialRefusal({ ...fresh, trial_used: true }, NOW), "used");
    });

    it("refuses it on top of a plan that is actually live, which it would overwrite", () => {
        // Approved and running: starting a trial here would replace paid time
        // with seven days, which is the one thing the old rule got right.
        const live = { ...fresh, plan_type: "monthly", plan_status: "active", expiry_date: tomorrow };
        assert.equal(trialRefusal(live, NOW), "used");
    });

    it("never lifts a ban: a blocked or suspended sign-up with its trial unused is refused", () => {
        assert.equal(trialRefusal({ ...fresh, status: "blocked", plan_status: "suspended" }, NOW), "locked");
        assert.equal(trialRefusal({ ...fresh, status: "blocked" }, NOW), "locked");
        assert.equal(trialRefusal({ ...fresh, plan_status: "suspended" }, NOW), "locked");
    });

    it("puts the ban ahead of everything else", () => {
        // A blocked owner whose trial is also used reads as "locked", not
        // "used": the message that sends them to the super admin is the useful
        // one.
        assert.equal(trialRefusal({ ...fresh, status: "blocked", trial_used: true }, NOW), "locked");
    });
});
