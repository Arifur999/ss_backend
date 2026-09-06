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

const summaryHtml = (rows: IEmailReportPayload["summary"]) => {
    if (rows.length === 0) return "";
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 28px;">
        ${rows.map((row, index) => `
          <tr>
            <td style="padding: 10px 0; font-size: 13px; color: ${MUTED}; ${index > 0 ? `border-top: 1px solid ${LINE};` : ""}">
              ${escapeHtml(row.label)}
            </td>
            <td align="right" style="padding: 10px 0; font-size: 14px; font-weight: bold; color: ${INK}; ${index > 0 ? `border-top: 1px solid ${LINE};` : ""}">
              ${escapeHtml(row.value)}
            </td>
          </tr>
        `).join("")}
      </table>
    `;
};

const tableHtml = (table: IEmailReportPayload["tables"][number]) => {
    if (table.rows.length === 0) return "";
    return `
      <p style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: ${INK};">${escapeHtml(table.title)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 28px;">
        <tr>
          ${table.columns.map((column, index) => `
            <th align="${index === 0 ? "left" : "right"}" style="padding: 8px 6px; background-color: ${INK}; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">
              ${escapeHtml(column)}
            </th>
          `).join("")}
        </tr>
        ${table.rows.map(row => `
          <tr>
            ${row.map((cell, index) => `
              <td align="${index === 0 ? "left" : "right"}" style="padding: 8px 6px; border-bottom: 1px solid ${LINE}; font-size: 12px; color: ${INK};">
                ${escapeHtml(cell)}
              </td>
            `).join("")}
          </tr>
        `).join("")}
      </table>
    `;
};

const reportEmailHtml = (payload: IEmailReportPayload, businessName: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #ffffff; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden; font-family: Arial, Helvetica, sans-serif;">
          <tr>
            <td style="background-color: ${BRAND}; padding: 18px 32px;">
              <span style="font-size: 16px; font-weight: bold; color: #ffffff;">${escapeHtml(businessName)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 4px; font-size: 20px; color: ${INK};">${escapeHtml(payload.title)}</h1>
              <p style="margin: 0 0 24px; font-size: 13px; color: ${MUTED};">${escapeHtml(payload.period)}</p>
              ${summaryHtml(payload.summary)}
              ${payload.tables.map(tableHtml).join("")}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid ${LINE};">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
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
