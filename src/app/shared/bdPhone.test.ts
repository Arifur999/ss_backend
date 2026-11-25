import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBdMobile, looksLikeBdPhone, normalizeBdPhone } from "./bdPhone.js";

describe("normalizeBdPhone", () => {
    it("keeps an eleven-digit number as it is", () => {
        assert.equal(normalizeBdPhone("01712345678"), "01712345678");
    });

    it("strips the punctuation people type", () => {
        assert.equal(normalizeBdPhone("01712-345678"), "01712345678");
        assert.equal(normalizeBdPhone("017 1234 5678"), "01712345678");
        assert.equal(normalizeBdPhone("  01712345678  "), "01712345678");
    });

    it("reads the international forms as the same number", () => {
        assert.equal(normalizeBdPhone("+8801712345678"), "01712345678");
        assert.equal(normalizeBdPhone("8801712345678"), "01712345678");
        assert.equal(normalizeBdPhone("+88 01712-345678"), "01712345678");
    });

    /**
     * A spreadsheet drops the leading zero of every phone number it is ever
     * shown. Rejecting that is technically right and practically useless.
     */
    it("puts back a leading zero a spreadsheet ate", () => {
        assert.equal(normalizeBdPhone("1712345678"), "01712345678");
    });

    /** The reported bug: ten digits registered an account. */
    it("refuses ten digits", () => {
        assert.equal(normalizeBdPhone("0171234567"), "");
    });

    it("refuses twelve digits", () => {
        assert.equal(normalizeBdPhone("017123456789"), "");
    });

    it("refuses a number that does not begin 01", () => {
        assert.equal(normalizeBdPhone("02712345678"), "");
        assert.equal(normalizeBdPhone("91712345678"), "");
    });

    it("refuses emptiness and things that are not text", () => {
        for (const value of ["", "   ", "phone", null, undefined, 1712345678, {}]) {
            assert.equal(normalizeBdPhone(value as unknown), "", `accepted ${JSON.stringify(value)}`);
        }
    });

    /**
     * Letters around a correct number do not make it correct - stripping
     * non-digits must not turn "call me on 01712345678 after 6" into a
     * stored phone number, but it must also not be treated as one.
     */
    it("is not fooled into accepting a sentence with a number in it", () => {
        assert.equal(normalizeBdPhone("call 01712345678 after six"), "");
    });
});

describe("isBdMobile", () => {
    it("is true only for eleven digits starting 01", () => {
        assert.equal(isBdMobile("01712345678"), true);
        assert.equal(isBdMobile("0171234567"), false);
        assert.equal(isBdMobile("01712-345678"), false);
    });
});

describe("looksLikeBdPhone", () => {
    it("accepts what a person would type and refuses what they would not", () => {
        assert.equal(looksLikeBdPhone("+880 1712-345678"), true);
        assert.equal(looksLikeBdPhone("0171234567"), false);
    });
});
