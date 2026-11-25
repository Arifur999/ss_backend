import z from "zod";
import { passwordSchema } from "../../utils/password.js";
import { BD_PHONE_MESSAGE, normalizeBdPhone } from "../../shared/bdPhone.js";

export const registerOwnerZodSchema = z.object({
    fullName: z.string("Full name must be string").min(2, "Full name must be at least 2 characters").max(100, "Full name must be at most 100 characters"),
    businessName: z.string("Business name must be string").min(2, "Business name must be at least 2 characters").max(150, "Business name must be at most 150 characters"),
    /**
     * Eleven digits, and stored that way whatever the owner typed.
     *
     * "At least 6 characters" is what a length check looks like when nobody
     * has decided what a phone number is: ten digits registered accounts, and
     * a workspace whose owner cannot be telephoned cannot be supported,
     * chased for a renewal, or shown to be real.
     */
    phone: z.string("Phone must be string")
        .transform((value) => normalizeBdPhone(value))
        .refine((value) => value !== "", BD_PHONE_MESSAGE),
    email: z.email("Email must be a valid email address"),
    password: passwordSchema(),
    address: z.string("Address must be string").optional(),
});

export const loginZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
    password: z.string("Password must be string").min(1, "Password is required"),
});

// The 6-digit code the user copies from their inbox.
export const verifyOtpZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
    otp: z.string("OTP must be string").length(6, "OTP must be exactly 6 digits"),
});

export const resendOtpZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
});

// Forgot password: request a reset code by email.
export const forgotPasswordZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
});

// Reset password: the emailed code + the new password.
export const resetPasswordZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
    otp: z.string("OTP must be string").length(6, "OTP must be exactly 6 digits"),
    password: passwordSchema(),
});
