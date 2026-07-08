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

// Simple, inline-styled HTML so it renders the same in every mail client.
const otpEmailHtml = (name: string, otp: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
    <h2 style="color: #1D9E75; margin: 0 0 8px;">Furniture Business Management</h2>
    <p style="color: #334155; margin: 0 0 16px;">Hi ${name || "there"},</p>
    <p style="color: #334155; margin: 0 0 16px;">
      Use the following one-time code to verify your email address.
      This code expires in <strong>5 minutes</strong>.
    </p>
    <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin: 0 0 16px;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a;">${otp}</span>
    </div>
    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
      If you did not request this code, you can safely ignore this email.
    </p>
  </div>
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
            from: `"Furniture Business" <${fromAddress()}>`,
            to,
            subject: "Your verification code",
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
            from: `"Furniture Business" <${fromAddress()}>`,
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
