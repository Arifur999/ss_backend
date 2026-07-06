import z from "zod";

export const createProfitWithdrawalZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    shareholder_id: z.uuid("Shareholder id must be a valid UUID"),
    shareholder_name: z.string("Shareholder name must be string").min(1, "Shareholder name is required"),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").min(1, "Account name is required"),
    profit_month: z.number("Profit month must be a number").int().min(1).max(12).nullable().optional(),
    profit_year: z.number("Profit year must be a number").int().nullable().optional(),
    notes: z.string("Notes must be string").optional(),
});

export const updateProfitWithdrawalZodSchema = createProfitWithdrawalZodSchema.partial();

export type ICreateProfitWithdrawalPayload = z.infer<typeof createProfitWithdrawalZodSchema>;
export type IUpdateProfitWithdrawalPayload = z.infer<typeof updateProfitWithdrawalZodSchema>;
