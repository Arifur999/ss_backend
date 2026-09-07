import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { PRODUCT_NAME } from "../../config/brand.js";
import { escapeHtml, sendTemplatedEmail } from "../../utils/email.js";
import { IEmailReportPayload } from "./report.validation.js";

// Table-based layout and the same colours as the OTP mail, for the reason
// spelled out in utils/email.ts: Outlook desktop renders with Word's engine,
// which understands nested <table>s and little else.
const BRAND = "#1D9E75";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

// Sits UNDER the tables, because a total belongs beneath what it totals -
// a cash count is read as a list of notes and then the sum of them.
//
// The last summary figure is the one the report exists for - a cash count's
// total, a month's profit - so it is drawn as a panel rather than as one more
// line in a list. Everything above it is context for it.
const summaryHtml = (rows: IEmailReportPayload["summary"]) => {
    if (rows.length === 0) return "";

    const lead = rows.slice(0, -1);
    const headline = rows[rows.length - 1];

    return `
      ${lead.length > 0 ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 18px;">
          ${lead.map((row) => `
            <tr>
              <td style="padding: 9px 0; font-size: 13px; color: ${MUTED}; border-bottom: 1px solid ${LINE};">
                ${escapeHtml(row.label)}
              </td>
              <td align="right" style="padding: 9px 0; font-size: 14px; font-weight: bold; color: ${INK}; border-bottom: 1px solid ${LINE};">
                ${escapeHtml(row.value)}
              </td>
            </tr>
          `).join("")}
        </table>
      ` : ""}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 30px;">
        <tr>
          <td style="background-color: ${INK}; border-radius: 12px; padding: 18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size: 12px; color: rgba(255,255,255,0.65); letter-spacing: 0.3px;">
                  ${escapeHtml(headline.label)}
                </td>
                <td align="right" style="font-size: 24px; font-weight: bold; color: #ffffff;">
                  ${escapeHtml(headline.value)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
};

// Zebra rows, because these are read across: a long column of figures with no
// banding is where an eye slips a line. Nested tables and inline styles for the
// reason utils/email.ts gives - Outlook renders mail with Word's engine.
const tableHtml = (table: IEmailReportPayload["tables"][number]) => {
    if (table.rows.length === 0) return "";
    return `
      <p style="margin: 0 0 10px; font-size: 12px; font-weight: bold; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.6px;">
        ${escapeHtml(table.title)}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 30px; border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden;">
        <tr>
          ${table.columns.map((column, index) => `
            <th align="${index === 0 ? "left" : "right"}" style="padding: 10px 12px; background-color: ${INK}; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
              ${escapeHtml(column)}
            </th>
          `).join("")}
        </tr>
        ${table.rows.map((row, rowIndex) => `
          <tr style="background-color: ${rowIndex % 2 === 1 ? "#f8fafc" : "#ffffff"};">
            ${row.map((cell, index) => `
              <td align="${index === 0 ? "left" : "right"}" style="padding: 9px 12px; border-top: 1px solid ${LINE}; font-size: 13px; color: ${index === 0 ? INK : "#334155"};">
                ${escapeHtml(cell)}
              </td>
            `).join("")}
          </tr>
        `).join("")}
      </table>
    `;
};

const reportEmailHtml = (payload: IEmailReportPayload, businessName: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eef2f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #ffffff; border-radius: 18px; overflow: hidden; font-family: Arial, Helvetica, sans-serif; box-shadow: 0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background-color: ${BRAND}; padding: 22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 17px; font-weight: bold; color: #ffffff; letter-spacing: 0.2px;">
                    ${escapeHtml(businessName)}
                  </td>
                  <td align="right" style="font-size: 11px; color: rgba(255,255,255,0.8); letter-spacing: 0.4px; text-transform: uppercase;">
                    ${escapeHtml(PRODUCT_NAME)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 32px 8px;">
              <h1 style="margin: 0 0 6px; font-size: 22px; line-height: 1.25; color: ${INK};">${escapeHtml(payload.title)}</h1>
              ${payload.period ? `<p style="margin: 0 0 26px; font-size: 13px; color: ${MUTED};">${escapeHtml(payload.period)}</p>` : `<div style="height: 20px;"></div>`}
              ${payload.tables.map(tableHtml).join("")}
              ${summaryHtml(payload.summary)}
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 32px 24px; background-color: #f8fafc; border-top: 1px solid ${LINE};">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.6;">
                Sent from ${escapeHtml(PRODUCT_NAME)} - please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

/**
 * Email a report to the business.
 *
 * The address is read from the database, never from the request: whoever is
 * signed in can only ever send this to their own workspace. That is what makes
 * it safe to render figures the browser computed - see the note in
 * report.validation.ts.
 *
 * The business address from Settings is preferred over the owner's login
 * email, because that is the one a shop actually reads. It falls back to the
 * login email when Settings carries none, so the button never fails for want
 * of a field somebody has not filled in.
 */
const emailReport = async (payload: IEmailReportPayload, user: IRequestUser) => {
    const [owner, settings] = await Promise.all([
        prisma.user.findUnique({
            where: { id: user.ownerId },
            select: { email: true, full_name: true },
        }),
        prisma.businessSettings.findFirst({
            where: { owner_id: user.ownerId },
            select: { name_en: true, name_bn: true, email: true },
        }),
    ]);

    const recipient = String(settings?.email || "").trim() || String(owner?.email || "").trim();

    if (!recipient) {
        throw new AppError(
            status.NOT_FOUND,
            "No email address to send the report to. Add one under Settings, or to the owner's account."
        );
    }

    const businessName = settings?.name_en || settings?.name_bn || PRODUCT_NAME;

    const subject = payload.period
        ? `${payload.title} - ${payload.period}`
        : payload.title;

    const sent = await sendTemplatedEmail(recipient, subject, reportEmailHtml(payload, businessName));

    if (!sent) {
        // Every configured provider refused, or none is configured. Saying so
        // beats a green tick over an email that never left.
        throw new AppError(
            status.BAD_GATEWAY,
            "The report could not be emailed - no mail provider accepted it. Check the email settings."
        );
    }

    return { sent: true, email: recipient };
};

export const ReportService = { emailReport };
