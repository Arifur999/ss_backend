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

// Returns the subscription plus any payment still awaiting super-admin
// approval. The pending payment is what lets the checkout / plans screens show
// "waiting for approval" instead of the plan cards after a page reload - the
// state lives on the server, not in localStorage.
const getMySubscription = async (user: IRequestUser) => {
    const subscription = await checkOwnerSubscriptionExpiry(user.ownerId);
    if (!subscription) return null;

    const pendingPayment = await prisma.subscriptionPayment.findFirst({
        where: { owner_id: user.ownerId, status: "pending" },
        orderBy: { created_at: "desc" },
    });

    return {
        ...subscription,
        pending_payment: pendingPayment
            ? {
                id: pendingPayment.id,
                invoice_no: pendingPayment.invoice_no,
                plan_type: pendingPayment.plan_type,
                amount: pendingPayment.amount,
                trx_id: pendingPayment.trx_id,
                submitted_at: pendingPayment.created_at,
            }
            : null,
    };
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
    const isMonthly = payload.plan_type === "monthly";

    // The free trial can be started exactly once, and NEVER once the owner is
    // on a paid plan - otherwise clicking "free trial" would wipe out a live
    // monthly/yearly subscription. Blocked if the trial was already used OR the
    // owner currently holds a paid plan. Only the super admin's
    // grant-trial-extension can revive trial access.
    const hasPaidPlan = existing.plan_type === "monthly" || existing.plan_type === "yearly";
    if (isTrial && (existing.trial_used || hasPaidPlan)) {
        throw new AppError(
            status.FORBIDDEN,
            "The free trial isn't available on this account. Please choose the monthly or yearly plan, or ask your super admin to grant a trial extension."
        );
    }

    // Contact info from the free-trial popup (for super-admin follow-up).
    // Persist the address on the subscription and name/phone on the user when
    // supplied; blanks are ignored so existing values aren't wiped.
    if (payload.full_name?.trim() || payload.phone?.trim()) {
        await prisma.user.update({
            where: { id: user.userId },
            data: {
                ...(payload.full_name?.trim() ? { full_name: payload.full_name.trim() } : {}),
                ...(payload.phone?.trim() ? { phone: payload.phone.trim() } : {}),
            },
        });
    }

    const expiry = isTrial ? addDays(now, 7) : isMonthly ? addMonths(now, 1) : addMonths(now, 12);

    const subscription = await prisma.ownerSubscription.update({
        where: { owner_id: user.ownerId },
        data: {
            status: isTrial ? SubscriptionStatus.active : SubscriptionStatus.pending,
            plan: isTrial ? "Trial" : isMonthly ? "Starter" : "Enterprise",
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
            trial_used: isTrial ? true : existing.trial_used,
            ...(payload.address?.trim() ? { address: payload.address.trim() } : {}),
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
    // The plan the owner is paying for was set on their subscription by
    // choosePlan (monthly or yearly); the amount follows that plan.
    const { yearly_price, monthly_price } = await PlatformSettingsService.getPaymentInfo();
    const existingSub = await prisma.ownerSubscription.findUnique({
        where: { owner_id: user.ownerId },
    });
    // The plan being paid for: prefer what the checkout sent (renew / switch),
    // otherwise fall back to the owner's current subscription plan.
    const planType =
        payload.plan_type === "monthly"
            ? "monthly"
            : payload.plan_type === "yearly"
                ? "yearly"
                : existingSub?.plan_type === "monthly"
                    ? "monthly"
                    : "yearly";
    const amount = planType === "monthly" ? monthly_price : yearly_price;

    const now = new Date();

    const payment = await prisma.$transaction(async (tx) => {
        const created = await tx.subscriptionPayment.create({
            data: {
                owner_id: user.ownerId,
                invoice_no: `SUB-${Date.now()}`,
                plan_type: planType,
                method: "bkash_manual",
                status: "pending",
                amount,
                sender_number: payload.sender_number,
                trx_id: payload.trx_id,
                date: now,
                notes: "Manual bKash payment submitted by owner",
            },
        });

        // If the owner is renewing while STILL ACTIVE, don't lock them out -
        // leave the subscription active; approval will extend the expiry. Only
        // owners who are expired/pending get flipped to "awaiting approval".
        const activeNow =
            existingSub?.plan_status === PlanStatus.active &&
            existingSub?.expiry_date != null &&
            existingSub.expiry_date.getTime() > Date.now();

        if (!activeNow) {
            await tx.ownerSubscription.update({
                where: { owner_id: user.ownerId },
                data: {
                    status: SubscriptionStatus.pending,
                    plan_type: planType,
                    plan_status: PlanStatus.expired,
                },
            });
        }

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
