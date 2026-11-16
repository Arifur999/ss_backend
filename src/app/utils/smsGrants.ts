// Free SMS credits bundled with the product, kept in one place so the
// registration flow and the payment-approval flow can never drift apart.

/** Every newly registered owner starts with this many credits, no purchase needed. */
export const SIGNUP_SMS_CREDITS = 10;

/**
 * Granted on every approved payment of a paid plan, renewals included: a
 * monthly plan credits 50 each month, a yearly one 600 each year. The plan
 * cards in both front ends quote these figures - Hatim/src/lib/planFeatures.ts
 * and the mobile plan screens - so the two must be changed together.
 */
export const PLAN_SMS_CREDITS: Record<string, number> = {
    monthly: 50,
    yearly: 600,
};

export const planSmsCredits = (planType: string | null | undefined): number =>
    PLAN_SMS_CREDITS[String(planType || "")] ?? 0;
