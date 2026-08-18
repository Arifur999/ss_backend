import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_URL, SUPPORT_NUMBER_FALLBACK, telHref } from "../config/brand.js";
import { escapeHtml } from "./escapeHtml.js";

// ---------------------------------------------------------------------------
// The email an owner gets when their subscription payment is approved.
//
// It replaced a plain invoice table. Everything that table carried is still
// here - invoice number, transaction id, the number they paid from, the amount
// - but the moment is worth more than a receipt: it is the point where someone
// decided to run their business on this software. So it reads as a gift card
// with the receipt underneath rather than the other way round.
//
// Table-based layout, inline styles, no images and no web fonts: Outlook
// desktop renders mail through Word's engine, which drops <style> blocks,
// flexbox and grid. Nested tables are the one layout every client agrees on.
// ---------------------------------------------------------------------------

// The app's palette, from Hatim/tailwind.config.js. Hex values rather than
// class names, because an email has no stylesheet to look them up in.
const INK = "#0F1117";        // navy-900 - the dark frame
const INK_SOFT = "#1F2430";   // one step up from INK, for the card's inner band
const GREEN = "#22C55E";      // brand.green - active, paid, good
const SURFACE = "#EEF0F6";    // surface - the panel behind the details
const BORDER = "#E2E6EF";     // surface.border
const MUTED = "#6B7280";      // neutral.500 - labels
const BODY = "#374151";       // neutral.700 - paragraphs
const PAGE = "#F5F6F8";       // neutral.50 - the page behind the card

export type PlanGiftCardInput = {
    /** Who to greet. */
    ownerName: string;
    /** The customer's own business, as they typed it at signup. */
    businessName: string;
    planType: string;
    amount: number;
    invoiceNo: string;
    trxId: string;
    senderNumber: string;
    purchaseDate: Date | string | null | undefined;
    expiryDate: Date | string | null | undefined;
    /** From platform settings; falls back to the number printed elsewhere. */
    supportNumber?: string | null;
};

const money = (n: number) => `Tk ${Number(n || 0).toLocaleString("en-US")}`;

const day = (value: Date | string | null | undefined) =>
    value
        ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "-";

const planLabel = (planType: string) => (planType === "yearly" ? "Yearly Plan" : "Monthly Plan");

/** How long the plan runs, said in words rather than as two dates again. */
const planTerm = (planType: string) => (planType === "yearly" ? "12 months of full access" : "1 month of full access");

/**
 * One label/value pair in the details panel. Values are escaped: business_name,
 * full_name, trx_id and sender_number are all typed by a person and land inside
 * markup that is mailed out.
 */
const detail = (label: string, value: string) => `
  <td width="50%" style="padding:10px 0;vertical-align:top;">
    <div style="font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${label}</div>
    <div style="margin-top:3px;font-size:14px;color:${INK};">${escapeHtml(value) || "-"}</div>
  </td>`;

export const planGiftCardSubject = (planType: string) =>
    `Welcome aboard - your ${planLabel(planType)} is active`;

export const buildPlanGiftCardHtml = (input: PlanGiftCardInput): string => {
    const support = String(input.supportNumber || "").trim() || SUPPORT_NUMBER_FALLBACK;
    const name = escapeHtml(input.ownerName) || "there";
    const business = input.businessName || input.ownerName || "-";

    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:20px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">

      <!-- Who this is from -->
      <tr>
        <td style="background-color:${INK};padding:20px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:-0.01em;">${PRODUCT_NAME}</div>
              <div style="margin-top:2px;font-size:11px;color:#9CA3AF;">${PRODUCT_TAGLINE}</div>
            </td>
            <td align="right">
              <span style="display:inline-block;background-color:${GREEN};color:#052e16;font-size:10px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Activated</span>
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- The gift card itself -->
      <tr>
        <td style="padding:28px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${INK_SOFT};border-radius:16px;">
            <tr>
              <td style="padding:26px 26px 22px;">
                <div style="font-size:11px;font-weight:bold;letter-spacing:0.16em;text-transform:uppercase;color:${GREEN};">Your plan</div>
                <div style="margin-top:8px;font-size:30px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;">${planLabel(input.planType)}</div>
                <div style="margin-top:6px;font-size:13px;color:#9CA3AF;">${planTerm(input.planType)}</div>

                <!-- The dashed line is what makes it read as a card rather than a box -->
                <div style="margin:20px 0;border-top:1px dashed #3A414F;font-size:0;line-height:0;">&nbsp;</div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td>
                    <div style="font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#9CA3AF;">Amount paid</div>
                    <div style="margin-top:4px;font-size:24px;font-weight:bold;color:#ffffff;">${money(input.amount)}</div>
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    <div style="font-size:11px;color:#9CA3AF;">Invoice</div>
                    <div style="margin-top:4px;font-size:13px;color:#ffffff;">${escapeHtml(input.invoiceNo) || "-"}</div>
                  </td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- The thank you -->
      <tr>
        <td style="padding:26px 28px 0;">
          <h1 style="margin:0 0 10px;font-size:19px;font-weight:bold;color:${INK};">Thank you, ${name}.</h1>
          <p style="margin:0;font-size:14px;line-height:1.7;color:${BODY};">
            Thank you for trusting ${PRODUCT_NAME} with ${escapeHtml(business)}. Your payment has been approved and
            your workspace is open again - every product, sale, customer and report is exactly where you left it.
            We are glad to be part of how your business runs, and we will keep earning that.
          </p>
        </td>
      </tr>

      <!-- The receipt, underneath -->
      <tr>
        <td style="padding:22px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SURFACE};border:1px solid ${BORDER};border-radius:14px;">
            <tr><td style="padding:6px 20px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${detail("Your business", business)}
                  ${detail("Software", `${PRODUCT_NAME} - ${PRODUCT_TAGLINE}`)}
                </tr>
                <tr>
                  ${detail("Purchase date", day(input.purchaseDate))}
                  ${detail("Expiry date", day(input.expiryDate))}
                </tr>
                <tr>
                  ${detail("Transaction ID", input.trxId || "-")}
                  ${detail("Paid from", input.senderNumber || "-")}
                </tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- Live support -->
      <tr>
        <td style="padding:22px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:14px;">
            <tr><td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td>
                  <div style="font-size:14px;font-weight:bold;color:${INK};">Need a hand? Call us.</div>
                  <div style="margin-top:3px;font-size:13px;color:${MUTED};">Live support, on a real phone.</div>
                </td>
                <td align="right">
                  <a href="${telHref(support)}" style="display:inline-block;background-color:${INK};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:11px 18px;border-radius:12px;">${escapeHtml(support)}</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:22px 28px 26px;" align="center">
          <a href="${PRODUCT_URL}" style="display:inline-block;background-color:${GREEN};color:#052e16;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:12px;">Open my workspace</a>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 28px;background-color:${SURFACE};border-top:1px solid ${BORDER};">
          <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};text-align:center;">
            Keep this email - it is your receipt. This message is automated, so please do not reply to it.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>`;
};
