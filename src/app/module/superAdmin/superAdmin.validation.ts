import z from "zod";

export const updateOwnerSubscriptionZodSchema = z.object({
    status: z.enum(["pending", "trial", "active", "expired", "blocked"], "Invalid status").optional(),
    plan: z.string("Plan must be string").optional(),
    plan_type: z.enum(["free_trial", "monthly", "yearly"], "Invalid plan type").optional(),
    plan_status: z.enum(["active", "expired", "suspended"], "Invalid plan status").optional(),
    start_date: z.string("start_date must be an ISO date string").optional(),
    expiry_date: z.string("expiry_date must be an ISO date string").optional(),
    active_until: z.string("active_until must be an ISO date string").nullable().optional(),
    blocked_reason: z.string("Blocked reason must be string").optional(),
    business_name: z.string("Business name must be string").optional(),
});

export const updateSubscriptionPaymentZodSchema = z.object({
    status: z.enum(["paid", "pending", "failed", "refunded"], "Invalid payment status").optional(),
    amount: z.number("Amount must be a number").nonnegative().optional(),
    method: z.string("Method must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export type IUpdateOwnerSubscriptionPayload = z.infer<typeof updateOwnerSubscriptionZodSchema>;
export type IUpdateSubscriptionPaymentPayload = z.infer<typeof updateSubscriptionPaymentZodSchema>;

/**
 * Confirmation for wiping an owner's operational data.
 *
 * The route had no schema, so `password: undefined` reached bcrypt.compare and
 * threw a 500 rather than being rejected as a bad request - on the one endpoint
 * that deletes a customer's entire history.
 */
export const resetOwnerDataZodSchema = z.object({
    password: z.string("Password must be string").min(1, "Your password is required to confirm this reset"),
});

export type IResetOwnerDataPayload = z.infer<typeof resetOwnerDataZodSchema>;
