import z from "zod";
import { LoanTransactionType, LoanType } from "../../../generated/prisma/enums.js";

export const createLoanZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    lender_id: z.uuid("Lender id must be a valid UUID").nullable().optional(),
    lender_name: z.string("Lender name must be string").min(1, "Lender name is required"),
    loan_type: z.enum([LoanType.bank, LoanType.personal], "Loan type must be bank or personal").optional(),
    transaction_type: z.enum([LoanTransactionType.receive, LoanTransactionType.payment], "Transaction type must be receive or payment").optional(),
    received_amount: z.number("Received amount must be a number").nonnegative().optional(),
    payment_amount: z.number("Payment amount must be a number").nonnegative().optional(),
    interest_amount: z.number("Interest amount must be a number").nonnegative().optional(),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").min(1, "Account name is required"),
    notes: z.string("Notes must be string").optional(),
});

export const updateLoanZodSchema = createLoanZodSchema.partial();

export type ICreateLoanPayload = z.infer<typeof createLoanZodSchema>;
export type IUpdateLoanPayload = z.infer<typeof updateLoanZodSchema>;
