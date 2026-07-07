import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

// ---------------------------------------------------------------------------
// Email sender (nodemailer over SMTP).
//
// Behaviour:
//  - When SMTP credentials are configured in .env, mails go out for real.
//  - When they are NOT configured (typical local development), the mail body
//    is skipped and the OTP is printed to the server console instead, so the
//    whole verification flow can still be tested end-to-end without an inbox.
// ---------------------------------------------------------------------------

// SMTP is considered "configured" only when both user and password exist.
const isSmtpConfigured = () =>
    Boolean(env.EMAIL_SENDER.SMTP_USER && env.EMAIL_SENDER.SMTP_PASS);

// Build the transporter lazily (once) so a missing config never crashes boot.
let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: env.EMAIL_SENDER.SMTP_HOST,
            port: Number(env.EMAIL_SENDER.SMTP_PORT),
            // Port 465 = implicit TLS; anything else (587 etc.) uses STARTTLS.
            secure: Number(env.EMAIL_SENDER.SMTP_PORT) === 465,
            auth: {
                user: env.EMAIL_SENDER.SMTP_USER,
                pass: env.EMAIL_SENDER.SMTP_PASS,
            },
        });
    }
    return transporter;
};

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
    // Development fallback: no SMTP configured -> print the code and move on.
    if (!isSmtpConfigured()) {
        console.log(`[otp] SMTP not configured - OTP for ${to} is: ${otp}`);
        return false;
    }

    try {
        await getTransporter().sendMail({
            from: `"Furniture Business" <${env.EMAIL_SENDER.SMTP_FROM}>`,
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
