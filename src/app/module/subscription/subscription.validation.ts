import z from "zod";

export const choosePlanZodSchema = z.object({
    plan_type: z.enum(["free_trial", "monthly", "yearly"], "plan_type must be free_trial, monthly or yearly"),
    amount: z.number("Amount must be a number").nonnegative().optional(),
    method: z.string("Method must be string").optional(),
});

export type IChoosePlanPayload = z.infer<typeof choosePlanZodSchema>;
