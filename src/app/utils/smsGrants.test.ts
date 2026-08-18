import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_SMS_CREDITS, SIGNUP_SMS_CREDITS, planSmsCredits } from "./smsGrants.js";

describe("planSmsCredits", () => {
    it("credits the bundle the plan cards promise", () => {
        // These three numbers are printed on /current-plan and /choose-plan.
        // Changing one here without changing src/lib/planFeatures.ts in the
        // frontend turns a card into a promise the wallet does not keep.
        assert.equal(SIGNUP_SMS_CREDITS, 10);
        assert.equal(planSmsCredits("monthly"), 100);
        assert.equal(planSmsCredits("yearly"), 500);
    });

    it("gives the free trial no bundle of its own", () => {
        // The trial's 10 SMS come from SIGNUP_SMS_CREDITS at registration, not
        // from approving a payment - there is no payment to approve.
        assert.equal(planSmsCredits("free_trial"), 0);
    });

    it("returns 0 for anything it does not recognise", () => {
        // A plan_type from an older row, or a typo in a manual edit, must not
        // credit an arbitrary wallet.
        assert.equal(planSmsCredits("enterprise"), 0);
        assert.equal(planSmsCredits(""), 0);
        assert.equal(planSmsCredits(null), 0);
        assert.equal(planSmsCredits(undefined), 0);
    });

    it("never carries a negative or fractional bundle", () => {
        // The wallet balance is an Int and a negative grant would silently
        // charge the owner credits for renewing.
        for (const [plan, credits] of Object.entries(PLAN_SMS_CREDITS)) {
            assert.ok(Number.isInteger(credits), `${plan} must be a whole number of SMS`);
            assert.ok(credits > 0, `${plan} must credit something`);
        }
    });

    it("gives the yearly plan more than the monthly one", () => {
        assert.ok(planSmsCredits("yearly") > planSmsCredits("monthly"));
    });
});
