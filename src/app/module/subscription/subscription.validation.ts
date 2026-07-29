import z from "zod";

// Plans sold: a 7-day free trial, a monthly plan, and a yearly plan.
export const choosePlanZodSchema = z.object({
    plan_type: z.enum(["free_trial", "monthly", "yearly"], "plan_type must be free_trial, monthly or yearly"),
    // Optional contact info submitted from the free-trial card popup, saved
    // for the super admin's follow-up (Free Trial page). All optional so the
    // yearly path (no popup) is unaffected.
    full_name: z.string("Full name must be string").optional(),
    phone: z.string("Phone must be string").optional(),
    address: z.string("Address must be string").optional(),
});

export type IChoosePlanPayload = z.infer<typeof choosePlanZodSchema>;

// Step 2 of the manual bKash checkout: the owner submits the number they
// paid FROM and the transaction id bKash gave them, for the super admin to
// cross-check against their own bKash statement.
export const submitManualPaymentZodSchema = z.object({
    sender_number: z
        .string("bKash number must be string")
        .regex(/^01[0-9]{9}$/, "Enter a valid 11-digit bKash number (e.g. 01XXXXXXXXX)"),
    trx_id: z
        .string("Transaction ID must be string")
        .min(6, "Transaction ID looks too short")
        .max(30, "Transaction ID looks too long"),
    // Which plan the owner is paying for (the amount is still resolved from
    // server-side settings). Optional for backward-compat with the old yearly
    // checkout; falls back to the owner's current subscription plan.
    plan_type: z.enum(["monthly", "yearly"]).optional(),
});

export type ISubmitManualPaymentPayload = z.infer<typeof submitManualPaymentZodSchema>;
