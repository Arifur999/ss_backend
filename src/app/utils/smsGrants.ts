// Free SMS credits bundled with the product, kept in one place so the
// registration flow and the payment-approval flow can never drift apart.

/** Every newly registered owner starts with this many credits, no purchase needed. */
export const SIGNUP_SMS_CREDITS = 10;

/** Granted once, on the owner's FIRST approved payment of each paid plan. */
export const PLAN_SMS_CREDITS: Record<string, number> = {
    monthly: 100,
    yearly: 500,
};

export const planSmsCredits = (planType: string | null | undefined): number =>
    PLAN_SMS_CREDITS[String(planType || "")] ?? 0;
