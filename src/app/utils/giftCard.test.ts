import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_NAME, SUPPORT_NUMBER_FALLBACK, telHref } from "../config/brand.js";
import { buildPlanGiftCardHtml, planGiftCardSubject, type PlanGiftCardInput } from "./giftCard.js";

const sample = (overrides: Partial<PlanGiftCardInput> = {}): PlanGiftCardInput => ({
    ownerName: "Arifur Rahman",
    businessName: "Hatim Furniture",
    planType: "yearly",
    amount: 5780,
    invoiceNo: "INV-2026-0007",
    trxId: "9J7K2L1M0N",
    senderNumber: "01711111111",
    purchaseDate: new Date("2026-08-18T10:00:00Z"),
    expiryDate: new Date("2027-08-18T10:00:00Z"),
    supportNumber: "01719731884",
    ...overrides,
});

describe("telHref", () => {
    it("dials a Bangladeshi local number internationally", () => {
        assert.equal(telHref("01719731884"), "tel:+8801719731884");
    });

    it("strips the formatting people type", () => {
        assert.equal(telHref("017-1973-1884"), "tel:+8801719731884");
    });

    it("passes an unexpected format through rather than guessing a country code", () => {
        // Better a link that dials exactly what is printed than one that
        // silently prefixes +88 onto a landline or a foreign number.
        assert.equal(telHref("+442071838750"), "tel:442071838750");
        assert.equal(telHref("029123456"), "tel:029123456");
    });
});

describe("planGiftCardSubject", () => {
    it("names the plan in the subject line", () => {
        assert.match(planGiftCardSubject("yearly"), /Yearly Plan/);
        assert.match(planGiftCardSubject("monthly"), /Monthly Plan/);
    });
});

describe("buildPlanGiftCardHtml", () => {
    it("carries everything the owner needs to keep", () => {
        const html = buildPlanGiftCardHtml(sample());
        // The receipt half: what they paid, for what, and how it can be traced.
        assert.ok(html.includes("Tk 5,780"), "amount");
        assert.ok(html.includes("INV-2026-0007"), "invoice number");
        assert.ok(html.includes("9J7K2L1M0N"), "transaction id");
        assert.ok(html.includes("01711111111"), "sender number");
        // The card half: whose it is, what it is, and how long it runs.
        assert.ok(html.includes("Hatim Furniture"), "business name");
        assert.ok(html.includes("Arifur Rahman"), "owner name");
        assert.ok(html.includes("Yearly Plan"), "plan");
        assert.ok(html.includes(PRODUCT_NAME), "product name");
        assert.ok(html.includes("18 Aug 2026"), "purchase date");
        assert.ok(html.includes("18 Aug 2027"), "expiry date");
    });

    it("makes the support number callable", () => {
        const html = buildPlanGiftCardHtml(sample());
        assert.ok(html.includes("tel:+8801719731884"), "support number must be a tel: link");
        assert.ok(html.includes(">01719731884<"), "and printed as typed");
    });

    it("falls back to the built-in support number when settings carry none", () => {
        // A welcome card with no number to call is the one thing it must not be.
        for (const missing of [null, undefined, "", "   "]) {
            const html = buildPlanGiftCardHtml(sample({ supportNumber: missing }));
            assert.ok(html.includes(SUPPORT_NUMBER_FALLBACK), `support fallback for ${JSON.stringify(missing)}`);
        }
    });

    it("escapes what the owner typed", () => {
        // business_name, full_name, trx_id and sender_number are all free text
        // typed by a person, and they land inside markup that is mailed out.
        const html = buildPlanGiftCardHtml(sample({
            businessName: '<script>alert("x")</script>',
            ownerName: "Tom & Jerry",
            trxId: "<b>TRX</b>",
        }));
        assert.ok(!html.includes("<script>"), "no raw script tag");
        assert.ok(html.includes("&lt;script&gt;"), "escaped instead");
        assert.ok(html.includes("Tom &amp; Jerry"), "ampersand escaped");
        assert.ok(html.includes("&lt;b&gt;TRX&lt;/b&gt;"), "trx id escaped");
    });

    it("says the right term for each plan", () => {
        assert.match(buildPlanGiftCardHtml(sample({ planType: "yearly" })), /12 months of full access/);
        assert.match(buildPlanGiftCardHtml(sample({ planType: "monthly" })), /1 month of full access/);
    });

    it("renders a dash rather than the word undefined for missing fields", () => {
        const html = buildPlanGiftCardHtml(sample({
            trxId: "",
            senderNumber: "",
            purchaseDate: null,
            expiryDate: null,
        }));
        assert.ok(!html.toLowerCase().includes("undefined"), "no stray undefined");
        assert.ok(!html.toLowerCase().includes("null"), "no stray null");
        assert.ok(!html.includes("Invalid Date"), "no Invalid Date");
    });

    it("greets someone even when the name is blank", () => {
        const html = buildPlanGiftCardHtml(sample({ ownerName: "" }));
        assert.ok(html.includes("Thank you, there."), "falls back to a greeting that still reads");
    });

    it("uses table markup throughout, for Outlook", () => {
        const html = buildPlanGiftCardHtml(sample());
        // Word's rendering engine drops flexbox and grid; nested tables are the
        // one layout Gmail, Outlook and Apple Mail all agree on.
        assert.ok(!html.includes("display:flex"), "no flexbox");
        assert.ok(!html.includes("display:grid"), "no grid");
        assert.ok(!html.includes("<style"), "no style block - Outlook strips it");
        assert.ok(html.includes('role="presentation"'), "layout tables marked presentational");
    });
});
