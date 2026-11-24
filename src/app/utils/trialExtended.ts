import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_URL, SUPPORT_NUMBER_FALLBACK, telHref } from "../config/brand.js";
import { escapeHtml } from "./escapeHtml.js";

// ---------------------------------------------------------------------------
// The email an owner gets when the super admin extends their free trial.
//
// Until now this happened silently: an owner who had run out, could not get
// in, and had asked for more time was given it without being told. They found
// out by trying the app again, if they tried.
//
// It is deliberately NOT the gift-card email. That one celebrates a purchase;
// this one is a reprieve, and the thing the owner most needs from it is the
// new date and a way to reach a human. So it leads with the date and carries
// the support number in the body rather than in the footer.
//
// Table-based layout, inline styles, no images and no web fonts, for the same
// reason as the gift card: Outlook desktop renders mail through Word's engine,
// which drops <style> blocks, flexbox and grid.
// ---------------------------------------------------------------------------

// The app's palette, from Hatim/tailwind.config.js.
const INK = "#0F1117";
const INK_SOFT = "#1F2430";
const BLUE = "#3B82F6";
const SURFACE = "#EEF0F6";
const BORDER = "#E2E6EF";
const MUTED = "#6B7280";
const BODY = "#374151";
const PAGE = "#F5F6F8";

export type TrialExtendedInput = {
    /** Who to greet. */
    ownerName: string;
    /** The customer's own business, as they typed it at signup. */
    businessName: string;
    /** How many days were added. */
    daysAdded: number;
    /** When the trial now runs out. */
    newExpiry: Date | string | null | undefined;
    /** From platform settings; the fallback is used when that is blank. */
    supportNumber?: string | null;
};

/** "22 Nov 2026", or an empty string when the date cannot be read. */
const formatDate = (value: Date | string | null | undefined): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const trialExtendedSubject = (daysAdded: number): string =>
    `Your free trial has been extended by ${daysAdded} ${daysAdded === 1 ? "day" : "days"}`;

export const buildTrialExtendedHtml = (input: TrialExtendedInput): string => {
    const support = String(input.supportNumber || "").trim() || SUPPORT_NUMBER_FALLBACK;
    const name = escapeHtml(input.ownerName) || "there";
    const business = escapeHtml(input.businessName || input.ownerName || "");
    const days = Math.max(1, Math.round(Number(input.daysAdded) || 0));
    const expiry = formatDate(input.newExpiry);
    const safeSupport = escapeHtml(support);

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
              <span style="display:inline-block;background-color:${BLUE};color:#ffffff;font-size:10px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Trial extended</span>
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- The new date, which is the whole point of the email -->
      <tr>
        <td style="padding:28px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${INK_SOFT};border-radius:16px;">
            <tr>
              <td style="padding:26px;">
                <div style="font-size:11px;font-weight:bold;letter-spacing:0.16em;text-transform:uppercase;color:#93C5FD;">You have more time</div>
                <div style="margin-top:8px;font-size:30px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;">+${days} ${days === 1 ? "day" : "days"}</div>
                ${expiry
            ? `<div style="margin-top:10px;font-size:13px;color:#9CA3AF;">Your free trial now runs until <span style="color:#ffffff;font-weight:bold;">${escapeHtml(expiry)}</span></div>`
            : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- What it means, in plain words -->
      <tr>
        <td style="padding:24px 28px 0;">
          <p style="margin:0;font-size:15px;color:${BODY};line-height:1.6;">Hello ${name},</p>
          <p style="margin:12px 0 0;font-size:15px;color:${BODY};line-height:1.6;">
            Good news - we have added <strong>${days} more ${days === 1 ? "day" : "days"}</strong> to your free trial${business ? ` for <strong>${business}</strong>` : ""}.
            You can sign in right now and carry on exactly where you left off. Nothing has been lost, and nothing needs setting up again.
          </p>
          <p style="margin:12px 0 0;font-size:15px;color:${BODY};line-height:1.6;">
            There is nothing to pay for this. When you are ready to continue past ${expiry ? escapeHtml(expiry) : "the end of the trial"}, you can pick a plan from inside the app at any time.
          </p>
        </td>
      </tr>

      <!-- The way back in -->
      <tr>
        <td align="center" style="padding:24px 28px 0;">
          <a href="${PRODUCT_URL}" style="display:inline-block;background-color:${INK};color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 30px;border-radius:999px;">Open my workspace</a>
        </td>
      </tr>

      <!-- A human, named in the body rather than buried in the footer -->
      <tr>
        <td style="padding:24px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SURFACE};border:1px solid ${BORDER};border-radius:14px;">
            <tr>
              <td style="padding:16px 18px;">
                <div style="font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">Need a hand?</div>
                <div style="margin-top:6px;font-size:15px;color:${BODY};line-height:1.6;">
                  Call or WhatsApp us on
                  <a href="${telHref(support)}" style="color:${INK};font-weight:bold;text-decoration:none;">${safeSupport}</a>
                  - we are happy to walk you through anything.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:22px 28px 28px;">
          <div style="border-top:1px solid ${BORDER};padding-top:16px;font-size:12px;color:${MUTED};line-height:1.6;">
            This message was sent by ${PRODUCT_NAME} because your trial was extended by our team.
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>`;
};
