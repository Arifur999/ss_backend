/**
 * What choosing a plan is allowed to change on a subscription.
 *
 * Kept apart from the service on purpose: the service reaches Prisma, which
 * reaches the env, so a test of this rule would need a database and a .env to
 * say anything at all. Here it is arithmetic over a plain object.
 *
 * ---------------------------------------------------------------------------
 * The one rule the whole file turns on
 * ---------------------------------------------------------------------------
 * A subscription row describes what the owner HAS. What they are trying to buy
 * is not the same thing and does not belong in the same columns.
 *
 * Clicking "Monthly" opens a bKash checkout. Nothing is charged, no payment row
 * exists, and the super admin has approved nothing. Writing plan, plan_type and
 * an expiry date at that moment made the Current Plan page announce a plan
 * nobody had paid for, with a date a month out - and it burned the free trial,
 * because the trial check read plan_type and could not tell "chose this" from
 * "owns this".
 *
 * So a paid selection now records one thing, pending_plan_type, which is the
 * question "which plan is this person paying for" that submitManualPayment has
 * to answer. Everything else waits for the approval.
 */

export type PlanStatusValue = "active" | "expired" | "suspended";
export type PlanTypeValue = "free_trial" | "monthly" | "yearly";

export type SubscriptionSnapshot = {
    plan_status?: PlanStatusValue | string | null;
    expiry_date?: Date | null;
    trial_used?: boolean | null;
};

export type PlanSelectionFields = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long the free trial runs.
 *
 * One constant, imported by auth.service for the window a registration opens
 * with, so the two can never promise different lengths. The plan cards in both
 * front ends quote this number in words - Hatim/src/lib/planFeatures.ts and
 * hatim_mobile/src/app/start-trial.tsx - so changing it here means changing it
 * there in the same breath.
 */
export const TRIAL_DAYS = 14;

export function addDaysTo(date: Date, days: number) {
    return new Date(date.getTime() + days * DAY);
}

export function addMonthsTo(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

/**
 * Whether the owner can still use the workspace at this moment.
 *
 * The same question submitManualPayment asks before it decides whether
 * submitting a payment should lock somebody out.
 */
export function hasLiveAccess(existing: SubscriptionSnapshot, now: Date) {
    return (
        existing.plan_status === "active" &&
        existing.expiry_date != null &&
        new Date(existing.expiry_date).getTime() > now.getTime()
    );
}

export type TrialSnapshot = SubscriptionSnapshot & {
    status?: string | null;
    plan_type?: PlanTypeValue | string | null;
};

/**
 * Why this owner may not start the free trial, or null when they may.
 *
 * "locked": never for an owner the super admin blocked or suspended. Starting
 * the trial writes plan_status "active" and clears blocked_reason, so a banned
 * sign-up whose trial was unused could lift its own ban.
 *
 * "used": the trial runs once - trial_used says so - and never on top of a plan
 * that is actually live, because starting it would overwrite the paid time the
 * owner has left.
 *
 * What does NOT refuse it: having clicked a paid plan. That was the bug. The
 * old check read `plan_type === "monthly"`, and choosePlan wrote that plan_type
 * the moment somebody opened the checkout - so a visitor who looked at the
 * monthly price, paid nothing and came back to the trial was told the trial was
 * already used. It never had been. Selecting is not owning, and only an
 * approval makes a paid plan real.
 */
export function trialRefusal(existing: TrialSnapshot, now: Date): "used" | "locked" | null {
    if (existing.status === "blocked" || existing.plan_status === "suspended") return "locked";
    if (existing.trial_used) return "used";
    if (hasLiveAccess(existing, now)) return "used";
    return null;
}

/**
 * The fields a plan selection writes.
 *
 * The free trial starts immediately, so it writes everything - it is the one
 * plan that needs no approval. It also clears pending_plan_type: whatever
 * checkout the owner wandered into, they have chosen the trial instead.
 *
 * A paid plan writes only pending_plan_type. Nothing about access, nothing the
 * Current Plan page reads, nothing that outlives an abandoned checkout. An
 * owner who is live stays live with their dates untouched; an owner who is
 * locked out stays locked out, which is the gating this flow is for. The
 * approval in superAdmin.service is what writes the real plan and dates, off
 * the payment row rather than off this.
 */
export function planSelectionFields(
    planType: PlanTypeValue,
    existing: SubscriptionSnapshot,
    now: Date,
): PlanSelectionFields {
    if (planType === "free_trial") {
        const expiry = addDaysTo(now, TRIAL_DAYS);
        return {
            plan: "Trial",
            plan_type: planType,
            plan_status: "active",
            trial_start: now,
            trial_end: expiry,
            active_until: expiry,
            start_date: now,
            expiry_date: expiry,
            trial_used: true,
            pending_plan_type: null,
            blocked_reason: "",
        };
    }

    return { pending_plan_type: planType };
}
