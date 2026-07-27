import z from "zod";

// Only two plans are sold now: a 7-day free trial and the yearly plan.
// (The "monthly" plan_type still exists in the DB enum for historical rows,
// it's just no longer offered as a choice here.)
export const choosePlanZodSchema = z.object({
    plan_type: z.enum(["free_trial", "yearly"], "plan_type must be free_trial or yearly"),
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
});

export type ISubmitManualPaymentPayload = z.infer<typeof submitManualPaymentZodSchema>;
