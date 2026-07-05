import status from "http-status";
import { PlanStatus, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { checkOwnerSubscriptionExpiry } from "../../utils/subscription.js";
import { IChoosePlanPayload } from "./subscription.validation.js";

const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const addMonths = (date: Date, months: number) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const getMySubscription = async (user: IRequestUser) => {
    return checkOwnerSubscriptionExpiry(user.ownerId);
};

// Mirrors the old SubscriptionPlans.choosePlan supabase upsert:
// - free_trial: active immediately for 7 days
// - monthly/yearly: pending until super admin confirms the payment
const choosePlan = async (payload: IChoosePlanPayload, user: IRequestUser) => {
    const existing = await prisma.ownerSubscription.findUnique({
        where: { owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Subscription not found for this owner");
    }

    const now = new Date();
    const isTrial = payload.plan_type === "free_trial";
    const expiry = isTrial
        ? addDays(now, 7)
        : payload.plan_type === "monthly"
            ? addMonths(now, 1)
            : addMonths(now, 12);

    const subscription = await prisma.$transaction(async (tx) => {
        const updated = await tx.ownerSubscription.update({
            where: { owner_id: user.ownerId },
            data: {
                status: isTrial ? SubscriptionStatus.active : SubscriptionStatus.pending,
                plan: isTrial ? "Trial" : payload.plan_type === "monthly" ? "Starter" : "Enterprise",
                trial_start: now,
                trial_end: addDays(now, 7),
                active_until: isTrial ? expiry : null,
                plan_type: payload.plan_type,
                plan_status: isTrial ? PlanStatus.active : PlanStatus.expired,
                start_date: now,
                expiry_date: expiry,
                blocked_reason: "",
            },
        });

        if (!isTrial) {
            await tx.subscriptionPayment.create({
                data: {
                    owner_id: user.ownerId,
                    invoice_no: `SUB-${Date.now()}`,
                    plan_type: payload.plan_type,
                    method: payload.method ?? "manual",
                    status: "pending",
                    amount: payload.amount ?? 0,
                    date: now,
                    notes: `${payload.plan_type} plan checkout`,
                },
            });
        }

        return updated;
    });

    await logAdminActivity({
        ownerId: user.ownerId,
        actorEmail: user.email,
        action: isTrial ? "trial_started" : "plan_selected",
        detail: isTrial
            ? "Started 7-day free trial"
            : `Selected ${payload.plan_type} plan (awaiting payment confirmation)`,
    });

    return subscription;
};

export const SubscriptionService = {
    getMySubscription,
    choosePlan,
};
