import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

// ---------------------------------------------------------------------------
// Email sender (nodemailer).
//
// Credential resolution order:
//  1. Google OAuth2  - GOOGLE_MAIL_USER + CLIENT_ID/SECRET + REFRESH_TOKEN
//                      (nodemailer exchanges the refresh token for access
//                      tokens automatically on every send)
//  2. SMTP password  - EMAIL_SENDER_SMTP_USER + PASS (e.g. Gmail App Password)
//  3. Console        - nothing configured: the OTP is printed to the server
//                      console so the flow stays testable in development
// ---------------------------------------------------------------------------

// OAuth2 is "configured" only when every required piece exists.
const isOAuthConfigured = () =>
    Boolean(
        env.GOOGLE.MAIL_USER &&
        env.GOOGLE.CLIENT_ID &&
        env.GOOGLE.CLIENT_SECRET &&
        env.GOOGLE.REFRESH_TOKEN
    );

// SMTP password fallback needs both user and password.
const isSmtpConfigured = () =>
    Boolean(env.EMAIL_SENDER.SMTP_USER && env.EMAIL_SENDER.SMTP_PASS);

// Build the transporter lazily (once) so a missing config never crashes boot.
let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
    if (!transporter) {
        if (isOAuthConfigured()) {
            // Gmail over OAuth2: no password stored anywhere, Google issues
            // short-lived access tokens from the long-lived refresh token.
            transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: env.GOOGLE.MAIL_USER,
                    clientId: env.GOOGLE.CLIENT_ID,
                    clientSecret: env.GOOGLE.CLIENT_SECRET,
                    refreshToken: env.GOOGLE.REFRESH_TOKEN,
                },
            });
        } else {
            // Classic SMTP with username/password (Gmail App Password etc.).
            transporter = nodemailer.createTransport({
                host: env.EMAIL_SENDER.SMTP_HOST,
                port: Number(env.EMAIL_SENDER.SMTP_PORT),
                // Port 465 = implicit TLS; anything else (587...) uses STARTTLS.
                secure: Number(env.EMAIL_SENDER.SMTP_PORT) === 465,
                auth: {
                    user: env.EMAIL_SENDER.SMTP_USER,
                    pass: env.EMAIL_SENDER.SMTP_PASS,
                },
            });
        }
    }
    return transporter;
};

// The address shown in the "From" header, picked from whichever credential
// set is active.
const fromAddress = () =>
    isOAuthConfigured() ? env.GOOGLE.MAIL_USER : env.EMAIL_SENDER.SMTP_FROM;

// A user's full_name ends up interpolated straight into HTML below. It's
// always mailed back to that same user (never to anyone else), so there's no
// cross-user injection risk - but escaping it is free, so do it anyway.
const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char] as string));

// Table-based layout (not divs/flexbox) because Outlook desktop renders mail
// with Word's engine, which mangles modern CSS but has always understood
// nested <table>s - this is the one layout approach that looks the same in
// Gmail, Outlook, and Apple Mail alike. Colors match the reminder-email
// template (defaultReminderTemplate.ts) so every system email in this app
// shares one visual identity.
const otpEmailHtml = (name: string, otp: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; font-family: Arial, Helvetica, sans-serif;">
          <tr>
            <td style="background-color: #1D9E75; padding: 18px 32px;">
              <span style="font-size: 16px; font-weight: bold; color: #ffffff;">Furniture Business Management</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 10px; font-size: 20px; color: #0f172a;">Verify your email address</h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
                Hi ${escapeHtml(name) || "there"}, use the one-time code below to finish verifying your account.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color: #f0fdf6; border: 1.5px dashed #1D9E75; border-radius: 12px; padding: 20px;">
                    <span style="font-family: 'Courier New', monospace; font-size: 34px; font-weight: bold; letter-spacing: 10px; color: #0f172a;">${otp}</span>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 24px; text-align: center;">
                <span style="display: inline-block; background-color: #fef3c7; color: #b45309; font-size: 12px; font-weight: bold; padding: 6px 14px; border-radius: 999px;">
                  Expires in 5 minutes
                </span>
              </p>
              <p style="margin: 0 0 6px; font-size: 13px; line-height: 1.6; color: #64748b;">
                Didn't request this code? You can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">
                For your security, never share this code with anyone - not even someone claiming to be our support team.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
                This is an automated message - please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

// Send the OTP mail. Returns true when a real email was sent, false when the
// console fallback was used - callers can surface that difference if needed.
export const sendOtpEmail = async (to: string, name: string, otp: string): Promise<boolean> => {
    // Development fallback: nothing configured -> print the code and move on.
    if (!isOAuthConfigured() && !isSmtpConfigured()) {
        console.log(`[otp] Email not configured - OTP for ${to} is: ${otp}`);
        return false;
    }

    try {
        await getTransporter().sendMail({
            from: `"Furniture Business Management" <${fromAddress()}>`,
            to,
            // Code in the subject too - most inboxes preview enough of the
            // subject line to verify without even opening the email.
            subject: `${otp} is your verification code`,
            html: otpEmailHtml(name, otp),
        });
        return true;
    } catch (error) {
        // Never let a mail-provider hiccup take the whole request down;
        // log the code so the user can still be helped manually.
        console.error(`[otp] Failed to email ${to}:`, error);
        console.log(`[otp] Fallback - OTP for ${to} is: ${otp}`);
        return false;
    }
};

// ---------------------------------------------------------------------------
// Generic templated email (used for subscription expiry reminders and the
// super admin's "send test email" preview button).
//
// Templates are plain strings with {{placeholder}} tokens - super admins
// edit them as raw HTML in Settings, so we deliberately do NOT run a full
// templating engine here, just a straightforward find-and-replace.
// ---------------------------------------------------------------------------

// Replace every {{key}} occurrence in the template with vars[key].
// Unknown placeholders are left as-is rather than throwing, so a typo in the
// admin's template never crashes the reminder cron.
export const renderTemplate = (template: string, vars: Record<string, string | number>): string => {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
        return key in vars ? String(vars[key]) : match;
    });
};

// Send an already-rendered HTML email. Same OAuth2 -> SMTP -> console
// fallback chain as sendOtpEmail, but with a caller-supplied subject/body.
export const sendTemplatedEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
    if (!isOAuthConfigured() && !isSmtpConfigured()) {
        console.log(`[mail] Email not configured - would have sent "${subject}" to ${to}:\n${html}`);
        return false;
    }

    try {
        await getTransporter().sendMail({
            from: `"Furniture Business Management" <${fromAddress()}>`,
            to,
            subject,
            html,
        });
        return true;
    } catch (error) {
        console.error(`[mail] Failed to email ${to}:`, error);
        return false;
    }
};
