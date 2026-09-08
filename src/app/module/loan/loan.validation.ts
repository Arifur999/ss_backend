import z from "zod";
import { LoanTransactionType, LoanType } from "../../../generated/prisma/enums.js";
import { PRINCIPAL, PROFIT } from "../../shared/loanBalance.js";

// The shape on its own, because the .refine() below produces something that can
// no longer be .partial()ed. otherIncome.validation.ts solves the same problem
// by writing its update schema out longhand, which lets the two drift; keeping
// one list of fields means a field added for create cannot go quietly missing
// from update.
const loanShape = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    lender_id: z.uuid("Lender id must be a valid UUID").nullable().optional(),
    lender_name: z.string("Lender name must be string").min(1, "Lender name is required"),
    loan_type: z.enum([LoanType.bank, LoanType.personal], "Loan type must be bank or personal").optional(),
    transaction_type: z.enum([LoanTransactionType.receive, LoanTransactionType.payment], "Transaction type must be receive or payment").optional(),
    received_amount: z.number("Received amount must be a number").nonnegative().optional(),
    payment_amount: z.number("Payment amount must be a number").nonnegative().optional(),
    interest_amount: z.number("Interest amount must be a number").nonnegative().optional(),
    // What the money in the two amount columns above WAS. A profit row still
    // moves cash - it just does not move the principal owed. Defaults to
    // principal on the column, so an older client that does not send it keeps
    // behaving exactly as before.
    payment_category: z.enum([PRINCIPAL, PROFIT], "Payment category must be principal or profit").optional(),
    // Which Expenses category a profit PAYMENT is filed under. Nullable rather
    // than merely optional: the client sends an explicit null when a row stops
    // being a profit payment, and Prisma skips undefined - so an omission would
    // leave a stale category sitting on the row.
    expense_category_id: z.uuid("Expense category id must be a valid UUID").nullable().optional(),
    expense_category_name: z.string("Expense category name must be string").optional().transform((value) => value ?? ""),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").min(1, "Account name is required"),
    notes: z.string("Notes must be string").optional(),
    // Deliberately absent: expense_id and other_income_id. z.object strips what
    // it does not name, so no client can point a loan at somebody else's
    // expense row. reconcileLoanProfitMirror is their only writer.
});

// Profit that was PAID becomes an expense, and an expense with no category is
// invisible in every category breakdown and budget on the site. Profit RECEIVED
// becomes other income, which has no categories at all - its source is the
// lender's name - so nothing is asked for on that side.
export const createLoanZodSchema = loanShape.refine(
    (data) =>
        !(data.payment_category === PROFIT && data.transaction_type === LoanTransactionType.payment)
        || Boolean(data.expense_category_id),
    {
        message: "Choose an expense category - profit paid is recorded as an expense",
        path: ["expense_category_id"],
    }
);

// The refine cannot survive .partial(): a PATCH may carry nothing but `notes`,
// and nothing in that request says what the row will BE afterwards. The same
// rule is enforced in updateLoan against the merged row, which is the only
// place that knows. See assertProfitHasCategory there.
export const updateLoanZodSchema = loanShape.partial();

export type ICreateLoanPayload = z.infer<typeof createLoanZodSchema>;
export type IUpdateLoanPayload = z.infer<typeof updateLoanZodSchema>;
