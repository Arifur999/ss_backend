/**
 * What choosing a plan is allowed to change on a subscription.
 *
 * Kept apart from the service on purpose: the service reaches Prisma, which
 * reaches the env, so a test of this rule would need a database and a .env to
 * say anything at all. Here it is arithmetic over a plain object.
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

/**
 * The fields a plan selection writes.
 *
 * The free trial starts immediately, so it writes everything.
 *
 * A paid plan is only *selected* here - nothing is charged and no payment row
 * exists yet. If the owner is still active it writes nothing that affects
 * access: their plan, dates and trial window are left exactly as they are, and
 * the super-admin approval switches them over, stacking the new expiry onto
 * whatever time is left. If they are already locked out they stay locked out,
 * which is the gating this flow is for.
 */
export function planSelectionFields(
    planType: PlanTypeValue,
    existing: SubscriptionSnapshot,
    now: Date,
): PlanSelectionFields {
    if (planType === "free_trial") {
        const expiry = addDaysTo(now, 7);
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
            blocked_reason: "",
        };
    }

    if (hasLiveAccess(existing, now)) return {};

    const expiry = planType === "monthly" ? addMonthsTo(now, 1) : addMonthsTo(now, 12);
    return {
        plan: planType === "monthly" ? "Starter" : "Enterprise",
        plan_type: planType,
        plan_status: "expired",
        start_date: now,
        expiry_date: expiry,
        active_until: null,
        blocked_reason: "",
    };
}
