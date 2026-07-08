import bcrypt from "bcryptjs";
import status from "http-status";
import { PlanStatus, Role, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { otpUtils } from "../../utils/otp.js";
import { checkOwnerSubscriptionExpiry } from "../../utils/subscription.js";
import { tokenUtils } from "../../utils/token.js";
import { ILoginPayload, IRegisterOwnerPayload } from "./auth.interface.js";

const TRIAL_DAYS = 7;

const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toProfile = (user: any) => ({
    id: user.id,
    owner_id: user.owner_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    branch_id: user.branch_id,
    is_active: user.is_active,
    last_active: user.last_active,
    created_at: user.created_at,
});

const buildTokenPayload = (user: {
    id: string;
    owner_id: string | null;
    role: Role;
    email: string;
    full_name: string;
}): IRequestUser => ({
    userId: user.id,
    ownerId: user.role === Role.super_admin ? user.id : (user.owner_id ?? user.id),
    role: user.role,
    email: user.email,
    name: user.full_name,
});

const registerOwner = async (payload: IRegisterOwnerPayload) => {
    const email = payload.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
        throw new AppError(status.CONFLICT, "An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(payload.password, 10);
    const registeredAt = new Date();

    // Mirrors the old `handle_new_owner_registration` trigger:
    // new owner starts an active 7-day free trial immediately.
    const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                email,
                password: hashedPassword,
                full_name: payload.fullName,
                phone: payload.phone,
                role: Role.owner,
            },
        });

        const updatedUser = await tx.user.update({
            where: { id: user.id },
            data: { owner_id: user.id },
        });

        const subscription = await tx.ownerSubscription.create({
            data: {
                owner_id: user.id,
                business_name: payload.businessName,
                owner_email: email,
                status: SubscriptionStatus.active,
                plan: "Trial",
                trial_start: registeredAt,
                trial_end: addDays(registeredAt, TRIAL_DAYS),
                active_until: addDays(registeredAt, TRIAL_DAYS),
                plan_type: "free_trial",
                plan_status: PlanStatus.active,
                start_date: registeredAt,
                expiry_date: addDays(registeredAt, TRIAL_DAYS),
                // This registration IS the owner's one free trial - mark it
                // used immediately so choosePlan() can never grant a second
                // one via self-service once this one expires.
                trial_used: true,
            },
        });

        return { user: updatedUser, subscription };
    });

    await logAdminActivity({
        ownerId: result.user.id,
        actorEmail: email,
        action: "owner_registered",
        detail: `${payload.businessName} registered with a ${TRIAL_DAYS}-day free trial`,
    });

    // SaaS email verification gate:
    // registration does NOT log the user in. We send a 6-digit OTP to their
    // inbox and the frontend shows the "enter code" screen. Cookies are only
    // issued after /auth/verify-otp succeeds.
    await otpUtils.issueOtp(email, payload.fullName);

    return {
        needsEmailConfirmation: true as const,
        email,
    };
};

// Step 2 of registration (and of unverified logins): the user submits the
// 6-digit code from their inbox. On success we flag the account verified and
// issue the auth cookies - this IS the login.
const verifyEmailOtp = async (email: string, code: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        throw new AppError(status.NOT_FOUND, "No account found with this email");
    }

    // Throws a descriptive AppError on wrong/expired/over-attempted codes.
    await otpUtils.verifyOtp(normalizedEmail, code);

    // Mark the account verified (idempotent if it somehow already was).
    const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: { email_verified: true },
    });

    let subscription = null;
    if (verifiedUser.role !== Role.super_admin) {
        subscription = await checkOwnerSubscriptionExpiry(verifiedUser.owner_id ?? verifiedUser.id);
    }

    // Verified -> issue tokens exactly like a successful login.
    const tokenPayload = buildTokenPayload(verifiedUser);

    return {
        user: { id: verifiedUser.id, email: verifiedUser.email },
        profile: toProfile(verifiedUser),
        subscription,
        accessToken: tokenUtils.getAccessToken(tokenPayload),
        refreshToken: tokenUtils.getRefreshToken(tokenPayload),
    };
};

// Re-send the verification code (60s cooldown enforced inside otpUtils).
const resendVerificationOtp = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        throw new AppError(status.NOT_FOUND, "No account found with this email");
    }

    if (user.email_verified) {
        throw new AppError(status.BAD_REQUEST, "This email is already verified. Please log in.");
    }

    await otpUtils.resendOtp(normalizedEmail, user.full_name);

    return { sent: true, email: normalizedEmail };
};

const loginUser = async (payload: ILoginPayload) => {
    const email = payload.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw new AppError(status.UNAUTHORIZED, "Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(payload.password, user.password);

    if (!isPasswordValid) {
        throw new AppError(status.UNAUTHORIZED, "Invalid email or password");
    }

    if (!user.is_active) {
        throw new AppError(status.FORBIDDEN, "Your account has been deactivated. Please contact your owner or administrator.");
    }

    // Email verification gate at login:
    // password was correct, but the email was never verified (e.g. the user
    // closed the tab during registration). We send a fresh OTP and tell the
    // frontend to show the verification screen instead of logging in.
    if (!user.email_verified && user.role !== Role.super_admin) {
        try {
            await otpUtils.issueOtp(user.email, user.full_name);
        } catch (error) {
            // Cooldown or mail issues must not block the response - the
            // frontend still needs to show the OTP screen with a resend button.
            console.error("[otp] Could not auto-send login OTP:", error);
        }

        return {
            needsEmailConfirmation: true as const,
            email: user.email,
        };
    }

    let subscription = null;

    // Login only checks credentials - it must never block on subscription
    // status. Pending / expired / suspended / blocked owners all sign in
    // successfully here; ProtectedRoute on the frontend reads `subscription`
    // and shows the matching lock screen (for "expired" specifically, that
    // screen sends the owner straight to the payment page). Blocking login
    // here instead would strand an expired owner with no way to ever reach
    // checkout and pay again.
    if (user.role !== Role.super_admin) {
        const ownerId = user.owner_id ?? user.id;
        subscription = await checkOwnerSubscriptionExpiry(ownerId);
    }

    if (user.role === Role.owner) {
        await prisma.user.update({
            where: { id: user.id },
            data: { last_active: new Date() },
        });
    }

    const tokenPayload = buildTokenPayload(user);
    const accessToken = tokenUtils.getAccessToken(tokenPayload);
    const refreshToken = tokenUtils.getRefreshToken(tokenPayload);

    return {
        user: { id: user.id, email: user.email },
        profile: toProfile(user),
        subscription,
        accessToken,
        refreshToken,
    };
};

const getMe = async (requestUser: IRequestUser) => {
    const user = await prisma.user.findUnique({
        where: { id: requestUser.userId },
    });

    if (!user) {
        throw new AppError(status.NOT_FOUND, "User not found");
    }

    let subscription = null;

    if (user.role !== Role.super_admin) {
        const ownerId = user.owner_id ?? user.id;
        subscription = await checkOwnerSubscriptionExpiry(ownerId);
    }

    return {
        user: { id: user.id, email: user.email },
        profile: toProfile(user),
        subscription,
    };
};

const getNewTokens = async (refreshTokenPayload: IRequestUser) => {
    const user = await prisma.user.findUnique({
        where: { id: refreshTokenPayload.userId },
    });

    if (!user || !user.is_active) {
        throw new AppError(status.UNAUTHORIZED, "Unauthorized access!");
    }

    const tokenPayload = buildTokenPayload(user);

    return {
        accessToken: tokenUtils.getAccessToken(tokenPayload),
        refreshToken: tokenUtils.getRefreshToken(tokenPayload),
    };
};

const touchOwnerActivity = async (requestUser: IRequestUser) => {
    if (requestUser.role !== Role.owner) return { touched: false };

    await prisma.user.update({
        where: { id: requestUser.userId },
        data: { last_active: new Date() },
    });

    return { touched: true };
};

export const AuthService = {
    registerOwner,
    loginUser,
    verifyEmailOtp,
    resendVerificationOtp,
    getMe,
    getNewTokens,
    touchOwnerActivity,
};
