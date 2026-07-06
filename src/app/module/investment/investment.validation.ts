import z from "zod";
import { recycleMetaZodSchema } from "../../shared/recycleSnapshot.js";

export const createInvestmentZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    shareholder_id: z.uuid("Shareholder id must be a valid UUID"),
    shareholder_name: z.string("Shareholder name must be string").min(1, "Shareholder name is required"),
    invest_amount: z.number("Invest amount must be a number").nonnegative().optional(),
    withdraw_amount: z.number("Withdraw amount must be a number").nonnegative().optional(),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").min(1, "Account name is required"),
    notes: z.string("Notes must be string").optional(),
});

export const updateInvestmentZodSchema = createInvestmentZodSchema.partial();

export const deleteWithRecycleZodSchema = z.object({
    recycle: recycleMetaZodSchema,
}).optional();

export type ICreateInvestmentPayload = z.infer<typeof createInvestmentZodSchema>;
export type IUpdateInvestmentPayload = z.infer<typeof updateInvestmentZodSchema>;
