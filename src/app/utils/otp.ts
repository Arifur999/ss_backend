import bcrypt from "bcryptjs";
import status from "http-status";
import AppError from "../errorHelpers/AppError.js";
import { prisma } from "../lib/prisma.js";
import { sendOtpEmail } from "./email.js";

// ---------------------------------------------------------------------------
// OTP lifecycle helpers (issue -> resend -> verify).
//
// Security rules baked in here:
//  - the raw 6-digit code is never stored, only its bcrypt hash
//  - a code expires 5 minutes after being (re)issued
//  - max 5 wrong attempts per code, then the user must request a new one
//  - resend is rate-limited to once every 60 seconds
//  - one active OTP row per (email, purpose); issuing again replaces it
// ---------------------------------------------------------------------------

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export const OTP_PURPOSE_VERIFY_EMAIL = "verify_email";

// Cryptographically-fine-for-otp random 6 digit code (100000..999999).
const generateOtpCode = () =>
    String(Math.floor(100000 + Math.random() * 900000));

// Issue (or re-issue) an OTP for the given email and send it out.
// Deletes any previous codes for the same purpose so only one is ever valid.
export const issueOtp = async (email: string, name: string, purpose = OTP_PURPOSE_VERIFY_EMAIL) => {
    const code = generateOtpCode();
    const codeHash = await bcrypt.hash(code, 8);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_TTL_MINUTES);

    // Replace-any-existing: prevents stale codes from piling up and keeps
    // "only the latest code works" semantics users expect.
    await prisma.$transaction([
        prisma.otp.deleteMany({ where: { email, purpose } }),
        prisma.otp.create({
            data: {
                email,
                code_hash: codeHash,
                purpose,
                expires_at: expiresAt,
                last_sent_at: new Date(),
            },
        }),
    ]);

    // Fire-and-forget: a slow/blocked mail provider must never hang the
    // registration/login/resend request that triggered this. sendOtpEmail()
    // catches every error internally and always resolves (never rejects),
    // so there's no unhandled-rejection risk in not awaiting it here.
    void sendOtpEmail(email, name, code);
};

// Re-send a code, enforcing the 60s cooldown. If the previous code already
// expired we issue a brand new one instead of resending the dead hash.
export const resendOtp = async (email: string, name: string, purpose = OTP_PURPOSE_VERIFY_EMAIL) => {
    const existing = await prisma.otp.findFirst({
        where: { email, purpose },
        orderBy: { created_at: "desc" },
    });

    if (existing) {
        const secondsSinceLastSend = (Date.now() - existing.last_sent_at.getTime()) / 1000;
        if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
            throw new AppError(
                status.TOO_MANY_REQUESTS,
                `Please wait ${wait} seconds before requesting a new code`
            );
        }
    }

    // A resend always mints a fresh code - simpler and strictly safer than
    // re-mailing the old one (we don't have the raw code anyway, only a hash).
    await issueOtp(email, name, purpose);
};

// Verify a submitted code. Throws a descriptive AppError on every failure
// path; on success the OTP row is deleted (single use).
export const verifyOtp = async (email: string, code: string, purpose = OTP_PURPOSE_VERIFY_EMAIL) => {
    const otpRow = await prisma.otp.findFirst({
        where: { email, purpose },
        orderBy: { created_at: "desc" },
    });

    if (!otpRow) {
        throw new AppError(status.BAD_REQUEST, "No verification code found. Please request a new one.");
    }

    if (otpRow.expires_at.getTime() < Date.now()) {
        await prisma.otp.delete({ where: { id: otpRow.id } });
        throw new AppError(status.BAD_REQUEST, "This code has expired. Please request a new one.");
    }

    if (otpRow.attempts >= MAX_ATTEMPTS) {
        await prisma.otp.delete({ where: { id: otpRow.id } });
        throw new AppError(status.TOO_MANY_REQUESTS, "Too many wrong attempts. Please request a new code.");
    }

    const isMatch = await bcrypt.compare(code, otpRow.code_hash);

    if (!isMatch) {
        // Burn one attempt on every wrong guess.
        await prisma.otp.update({
            where: { id: otpRow.id },
            data: { attempts: { increment: 1 } },
        });
        const remaining = MAX_ATTEMPTS - otpRow.attempts - 1;
        throw new AppError(
            status.BAD_REQUEST,
            remaining > 0
                ? `Wrong code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
                : "Wrong code. Please request a new one."
        );
    }

    // Success: the code is single-use, remove it immediately.
    await prisma.otp.delete({ where: { id: otpRow.id } });
};

export const otpUtils = { issueOtp, resendOtp, verifyOtp };
