import z from "zod";
import { LenderType } from "../../../generated/prisma/enums.js";

export const createLoanLenderZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    lender_type: z.enum([LenderType.bank, LenderType.person, LenderType.boss, LenderType.ngo], "Lender type must be bank, ngo, person or boss").optional(),
    phone: z.string("Phone must be string").optional(),
    address: z.string("Address must be string").optional(),
    opening_balance: z.number("Opening balance must be a number").optional(),
    opening_date: z.string("Opening date must be string (YYYY-MM-DD)").nullable().optional(),
    /**
     * The terms of the loan.
     *
     * direction is two words and not an enum - the same choice as
     * Loan.payment_category - so it is spelled out here instead, because an
     * open string column is only as safe as whatever writes to it.
     */
    direction: z.enum(["taken", "given"], "Direction must be taken or given").optional(),
    loan_date: z.string("Loan date must be string (YYYY-MM-DD)").nullable().optional(),
    loan_amount: z.number("Loan amount must be a number").nonnegative("Loan amount cannot be negative").optional(),
    interest_rate: z.number("Profit rate must be a number").nonnegative("Profit rate cannot be negative").optional(),
    monthly_amount: z.number("Monthly installment must be a number").nonnegative("Monthly installment cannot be negative").optional(),
    notes: z.string("Notes must be string").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateLoanLenderZodSchema = createLoanLenderZodSchema.partial();

export type ICreateLoanLenderPayload = z.infer<typeof createLoanLenderZodSchema>;
export type IUpdateLoanLenderPayload = z.infer<typeof updateLoanLenderZodSchema>;
