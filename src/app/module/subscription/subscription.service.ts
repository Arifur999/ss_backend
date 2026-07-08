import status from "http-status";
import { PlanStatus, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { checkOwnerSubscriptionExpiry } from "../../utils/subscription.js";
import { PlatformSettingsService } from "../platformSettings/platformSettings.service.js";
import { IChoosePlanPayload, ISubmitManualPaymentPayload } from "./subscription.validation.js";

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
// - yearly: flips the subscription to "pending" and sends the owner to the
//   manual bKash checkout screen; nothing is charged and no payment row is
//   created here - that only happens once they actually submit a
//   transaction id via submitManualPayment() below.
const choosePlan = async (payload: IChoosePlanPayload, user: IRequestUser) => {
    const existing = await prisma.ownerSubscription.findUnique({
        where: { owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Subscription not found for this owner");
    }

    const now = new Date();
    const isTrial = payload.plan_type === "free_trial";
    const expiry = isTrial ? addDays(now, 7) : addMonths(now, 12);

    const subscription = await prisma.ownerSubscription.update({
        where: { owner_id: user.ownerId },
        data: {
            status: isTrial ? SubscriptionStatus.active : SubscriptionStatus.pending,
            plan: isTrial ? "Trial" : "Enterprise",
            trial_start: now,
            trial_end: addDays(now, 7),
            active_until: isTrial ? expiry : null,
            plan_type: payload.plan_type,
            // Paid plans stay "expired" (i.e. locked out) until a super admin
            // approves the submitted payment - see superAdmin.service.ts.
            plan_status: isTrial ? PlanStatus.active : PlanStatus.expired,
            start_date: now,
            expiry_date: expiry,
            blocked_reason: "",
        },
    });

    await logAdminActivity({
        ownerId: user.ownerId,
        actorEmail: user.email,
        action: isTrial ? "trial_started" : "plan_selected",
        detail: isTrial
            ? "Started 7-day free trial"
            : "Selected yearly plan - redirected to manual bKash checkout",
    });

    return subscription;
};

// Step 2 of the manual bKash checkout: the owner has already sent money to
// the platform's bKash number (shown on the checkout page) and now submits
// the number they paid FROM plus the bKash transaction id, for a super admin
// to manually cross-check and approve.
const submitManualPayment = async (payload: ISubmitManualPaymentPayload, user: IRequestUser) => {
    // Guard against the same transaction id being submitted twice (by this
    // owner or, in theory, copy-pasted by another one).
    const duplicate = await prisma.subscriptionPayment.findFirst({
        where: { trx_id: payload.trx_id },
    });

    if (duplicate) {
        throw new AppError(status.CONFLICT, "This transaction ID has already been submitted");
    }

    // Amount is always taken from the server-side settings, never trusted
    // from the client, so a tampered request can't under-report what's owed.
    const { yearly_price } = await PlatformSettingsService.getPaymentInfo();

    const now = new Date();

    const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.subscriptionPayment.create({
            data: {
                owner_id: user.ownerId,
                invoice_no: `SUB-${Date.now()}`,
                plan_type: "yearly",
                method: "bkash_manual",
                status: "pending",
                amount: yearly_price,
                sender_number: payload.sender_number,
                trx_id: payload.trx_id,
                date: now,
                notes: "Manual bKash payment submitted by owner",
            },
        });

        // Make sure the subscription reflects "awaiting approval" even if the
        // owner somehow reached this screen without going through choosePlan.
        await tx.ownerSubscription.update({
            where: { owner_id: user.ownerId },
            data: {
                status: SubscriptionStatus.pending,
                plan_type: "yearly",
                plan_status: PlanStatus.expired,
            },
        });

        return created;
    });

    await logAdminActivity({
        ownerId: user.ownerId,
        actorEmail: user.email,
        action: "payment_submitted",
        detail: `Submitted bKash payment (trx: ${payload.trx_id}) - awaiting super admin approval`,
    });

    return payment;
};

export const SubscriptionService = {
    getMySubscription,
    choosePlan,
    submitManualPayment,
};
