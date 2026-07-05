import bcrypt from "bcryptjs";
import status from "http-status";
import { PlanStatus, Role, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { checkOwnerSubscriptionExpiry } from "../../utils/subscription.js";
import { tokenUtils } from "../../utils/token.js";
import { ILoginPayload, IRegisterOwnerPayload } from "./auth.interface.js";

export const SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE =
    "Your subscription has expired! Please purchase a dynamic renewal plan or request an administrator to grant a free trial extension to regain system access.";

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

    const tokenPayload = buildTokenPayload(result.user);
    const accessToken = tokenUtils.getAccessToken(tokenPayload);
    const refreshToken = tokenUtils.getRefreshToken(tokenPayload);

    return {
        user: { id: result.user.id, email: result.user.email },
        profile: toProfile(result.user),
        subscription: result.subscription,
        accessToken,
        refreshToken,
    };
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

    let subscription = null;

    if (user.role !== Role.super_admin) {
        const ownerId = user.owner_id ?? user.id;
        subscription = await checkOwnerSubscriptionExpiry(ownerId);

        // Login gate: expired / suspended / blocked accounts cannot sign in.
        // (pending is allowed in - the app shows a lock screen instead.)
        if (subscription) {
            const planExpired =
                subscription.plan_status === PlanStatus.expired ||
                subscription.plan_status === PlanStatus.suspended ||
                (subscription.plan_status === PlanStatus.active &&
                    subscription.expiry_date.getTime() <= Date.now());
            const statusBlocked =
                subscription.status === SubscriptionStatus.expired ||
                subscription.status === SubscriptionStatus.blocked;

            if (planExpired || statusBlocked) {
                throw new AppError(status.FORBIDDEN, SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE);
            }
        }
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
    getMe,
    getNewTokens,
    touchOwnerActivity,
};
