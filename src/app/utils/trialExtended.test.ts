import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUPPORT_NUMBER_FALLBACK } from "../config/brand.js";
import { buildTrialExtendedHtml, trialExtendedSubject, type TrialExtendedInput } from "./trialExtended.js";

const base: TrialExtendedInput = {
    ownerName: "Karim Uddin",
    businessName: "Hatim Furniture",
    daysAdded: 7,
    newExpiry: new Date("2026-12-01T00:00:00Z"),
    supportNumber: "01719731884",
};

describe("trialExtendedSubject", () => {
    it("says how many days were added", () => {
        assert.equal(trialExtendedSubject(7), "Your free trial has been extended by 7 days");
    });

    it("says day, not days, for one", () => {
        assert.equal(trialExtendedSubject(1), "Your free trial has been extended by 1 day");
    });
});

describe("buildTrialExtendedHtml", () => {
    it("leads with the number of days and the new date", () => {
        // The two things the owner actually needs; everything else is manners.
        const html = buildTrialExtendedHtml(base);
        assert.ok(html.includes("+7 days"));
        assert.ok(html.includes("01 Dec 2026"));
    });

    it("greets the owner and names their business", () => {
        const html = buildTrialExtendedHtml(base);
        assert.ok(html.includes("Hello Karim Uddin"));
        assert.ok(html.includes("Hatim Furniture"));
    });

    it("carries the support number, as a number and as a dialable link", () => {
        const html = buildTrialExtendedHtml(base);
        assert.ok(html.includes("01719731884"));
        assert.ok(html.includes("tel:+8801719731884"));
    });

    it("falls back to the house number when settings carry none", () => {
        // Better a number that reaches somebody than a support line with a gap
        // where the number should be.
        for (const missing of [undefined, null, "", "   "]) {
            const html = buildTrialExtendedHtml({ ...base, supportNumber: missing });
            assert.ok(html.includes(SUPPORT_NUMBER_FALLBACK), `failed for ${JSON.stringify(missing)}`);
        }
    });

    it("says one day rather than one days", () => {
        const html = buildTrialExtendedHtml({ ...base, daysAdded: 1 });
        assert.ok(html.includes("+1 day<"));
        assert.ok(!html.includes("+1 days"));
    });

    /**
     * A name is typed by a person and lands inside markup. The gift-card email
     * escapes for the same reason; an apostrophe in a business name must not
     * be able to end an attribute.
     */
    it("escapes whatever the owner typed as their name", () => {
        const html = buildTrialExtendedHtml({
            ...base,
            ownerName: "<script>alert(1)</script>",
            businessName: "Karim's \"Best\" Furniture",
        });
        assert.ok(!html.includes("<script>"));
        assert.ok(html.includes("&lt;script&gt;"));
        assert.ok(!html.includes('Karim\'s "Best"'));
    });

    it("drops the date line rather than printing an unreadable one", () => {
        for (const bad of [null, undefined, "not a date"]) {
            const html = buildTrialExtendedHtml({ ...base, newExpiry: bad });
            assert.ok(!html.includes("Invalid Date"));
            assert.ok(!html.includes("now runs until"));
            // The days are still there, so the email still says something.
            assert.ok(html.includes("+7 days"));
        }
    });

    it("never prints a zero or negative number of days", () => {
        // An extension of nothing is not an email worth sending, but if one is
        // ever triggered it must not read as "+0 days".
        for (const odd of [0, -3]) {
            const html = buildTrialExtendedHtml({ ...base, daysAdded: odd });
            assert.ok(html.includes("+1 day<"));
        }
    });

    it("still greets someone when the name is blank", () => {
        const html = buildTrialExtendedHtml({ ...base, ownerName: "", businessName: "" });
        assert.ok(html.includes("Hello there"));
    });

    it("links back to the app so there is a way in", () => {
        const html = buildTrialExtendedHtml(base);
        assert.ok(html.includes("https://furnify.softech.agency"));
        assert.ok(html.includes("Open my workspace"));
    });
});
