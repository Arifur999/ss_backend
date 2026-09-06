import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveDraftZodSchema } from "./draft.validation.js";

// The schema deliberately does NOT check what is inside `data` - a draft is a
// half-finished form and validating it would refuse the very thing being saved.
// Two things are checked, and they are what this pins down: the kind, because
// it decides which list a draft appears in, and the size, because the payload
// is composed in a browser and without a ceiling one click could park a
// megabyte.

const valid = {
    kind: "purchase_order" as const,
    title: "Hatim furniture",
    subtitle: "PO-2609-7850",
    amount: 52099,
    data: { form: { si_no: "PO-2609-7850" }, items: [{ qty: 1 }], spPercent: 0 },
};

describe("saveDraftZodSchema", () => {
    it("takes a draft shaped like the one the page parks", () => {
        assert.equal(saveDraftZodSchema.safeParse(valid).success, true);
    });

    it("takes a half-finished form, which is the entire point", () => {
        const barelyStarted = {
            kind: "sale" as const,
            data: { form: { customer_name: "" }, items: [{ product_name: "", qty: 0 }] },
        };
        assert.equal(saveDraftZodSchema.safeParse(barelyStarted).success, true);
    });

    it("only knows two kinds of draft", () => {
        assert.equal(saveDraftZodSchema.safeParse({ ...valid, kind: "sale" }).success, true);
        assert.equal(saveDraftZodSchema.safeParse({ ...valid, kind: "invoice" }).success, false);
        assert.equal(saveDraftZodSchema.safeParse({ ...valid, kind: "" }).success, false);
    });

    it("insists data is an object, not a string or an array", () => {
        assert.equal(saveDraftZodSchema.safeParse({ ...valid, data: "{}" }).success, false);
        assert.equal(saveDraftZodSchema.safeParse({ ...valid, data: undefined }).success, false);
    });

    it("refuses a payload over 256 KB, and takes one just under", () => {
        const underTheLimit = { ...valid, data: { note: "x".repeat(200 * 1024) } };
        assert.equal(saveDraftZodSchema.safeParse(underTheLimit).success, true);

        const overTheLimit = { ...valid, data: { note: "x".repeat(300 * 1024) } };
        const result = saveDraftZodSchema.safeParse(overTheLimit);
        assert.equal(result.success, false);
        // The message names the actual size, so somebody hitting it can tell a
        // runaway form from a genuinely enormous order.
        assert.match(result.error?.issues[0]?.message ?? "", /too large to save/);
    });

    it("treats title, subtitle and amount as optional", () => {
        const bare = { kind: "sale" as const, data: {} };
        assert.equal(saveDraftZodSchema.safeParse(bare).success, true);
    });
});
