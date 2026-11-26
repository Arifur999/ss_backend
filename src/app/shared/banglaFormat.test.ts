import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { banglaPlanLabel, formatBanglaDate, toBanglaDigits } from "./banglaFormat.js";

describe("toBanglaDigits", () => {
    it("converts every digit", () => {
        assert.equal(toBanglaDigits("0123456789"), "০১২৩৪৫৬৭৮৯");
    });

    it("takes a number as readily as a string", () => {
        assert.equal(toBanglaDigits(15), "১৫");
    });

    it("leaves everything that is not a digit alone", () => {
        assert.equal(toBanglaDigits("Tk 1,250.50"), "Tk ১,২৫০.৫০");
        assert.equal(toBanglaDigits("দিন"), "দিন");
    });

    it("is empty for nothing, not the word undefined", () => {
        assert.equal(toBanglaDigits(""), "");
        assert.equal(toBanglaDigits(null as unknown as string), "");
        assert.equal(toBanglaDigits(undefined as unknown as string), "");
    });
});

describe("formatBanglaDate", () => {
    it("writes the day, the month in Bangla and the year", () => {
        assert.equal(formatBanglaDate(new Date(2026, 11, 7)), "০৭ ডিসেম্বর ২০২৬");
    });

    it("pads a single-digit day, as the English format does", () => {
        assert.equal(formatBanglaDate(new Date(2026, 0, 3)), "০৩ জানুয়ারি ২০২৬");
    });

    it("names every month", () => {
        const months = Array.from({ length: 12 }, (_, index) => formatBanglaDate(new Date(2026, index, 1)));
        assert.equal(new Set(months).size, 12, "two months share a name");
        assert.ok(months.every((value) => value !== ""), "a month came back empty");
    });

    it("takes a string date too", () => {
        assert.equal(formatBanglaDate("2026-12-07T00:00:00Z").endsWith("২০২৬"), true);
    });

    /**
     * An email with "Invalid Date" in it has to be apologised for. Nothing at
     * all in that spot is a gap the reader skims past.
     */
    it("prints nothing rather than Invalid Date", () => {
        for (const bad of [null, undefined, "", "not a date", new Date("x")]) {
            assert.equal(formatBanglaDate(bad as never), "");
        }
    });
});

describe("banglaPlanLabel", () => {
    it("says what the plan is, not what the column is called", () => {
        assert.equal(banglaPlanLabel("free_trial"), "ফ্রি ট্রায়াল");
        assert.equal(banglaPlanLabel("monthly"), "মাসিক");
        assert.equal(banglaPlanLabel("yearly"), "বার্ষিক");
    });

    it("does not care about case", () => {
        assert.equal(banglaPlanLabel("Yearly"), "বার্ষিক");
    });

    it("passes an unknown plan through rather than inventing one", () => {
        assert.equal(banglaPlanLabel("lifetime"), "lifetime");
        assert.equal(banglaPlanLabel(null), "");
        assert.equal(banglaPlanLabel(undefined), "");
    });
});
