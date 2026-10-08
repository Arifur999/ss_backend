import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReviewEmails, skipsLoginOtp } from "./loginOtp.js";

describe("parseReviewEmails", () => {
    it("reads a comma-separated list, trimmed and lower-cased", () => {
        assert.deepEqual(parseReviewEmails(" Review@Example.com , ,demo@shop.bd"), ["review@example.com", "demo@shop.bd"]);
    });

    it("is empty when unset", () => {
        assert.deepEqual(parseReviewEmails(undefined), []);
        assert.deepEqual(parseReviewEmails(""), []);
    });
});

describe("skipsLoginOtp", () => {
    const base = { otpEnabled: true, reviewEmails: [] as string[], email: "owner@shop.bd", emailVerified: true };

    it("asks for the code by default", () => {
        assert.equal(skipsLoginOtp(base), false);
    });

    it("skips it for everyone when the code is switched off", () => {
        assert.equal(skipsLoginOtp({ ...base, otpEnabled: false }), true);
    });

    it("skips it only for a listed review account", () => {
        const reviewEmails = ["review@example.com"];
        assert.equal(skipsLoginOtp({ ...base, reviewEmails, email: "Review@Example.com" }), true);
        assert.equal(skipsLoginOtp({ ...base, reviewEmails }), false);
    });

    it("never skips it for an account that has not confirmed its email", () => {
        assert.equal(skipsLoginOtp({ ...base, otpEnabled: false, emailVerified: false }), false);
        assert.equal(skipsLoginOtp({ ...base, reviewEmails: ["owner@shop.bd"], emailVerified: false }), false);
    });
});
