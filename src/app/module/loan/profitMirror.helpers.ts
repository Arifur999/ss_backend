import { IncomeType, Prisma } from "../../../generated/prisma/client.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { type LoanRow } from "../../shared/loanBalance.js";
import { planLoanMirror, type MirrorLinks } from "../../shared/loanProfitMirror.js";

// Writes the expense or other-income that puts a loan profit row into the
// profit-and-loss, and keeps it correct through every edit.
//
// The deciding lives in shared/loanProfitMirror.ts, where a test can reach it
// without a database. This file is only the Prisma half of it.

type Tx = Prisma.TransactionClient;

/** The loan columns a twin is built from. */
export type LoanMirrorSource = LoanRow & MirrorLinks & {
    id: string;
    date: Date;
    lender_name: string;
    account_name: string;
    notes: string;
    expense_category_id: string | null;
    expense_category_name: string;
    income_source_name: string;
};

// Only reachable by a row that predates the category picker - one restored from
// an older snapshot, or backfilled. The money still has to reach the P&L, and
// leaving the name blank would file it under the empty string, which every
// category breakdown on the site renders as a gap.
const UNCATEGORISED = "Loan Profit (uncategorised)";

/**
 * Where the money went, said in a sentence, since the twin cannot say it in its
 * Account column.
 *
 * The account is named here and deliberately NOT in account_name.
 * ExpenseTransactions.tsx renders that field under an "Account" heading, and a
 * bank printed there against a row that did not move it sends the reader to the
 * Balance Dashboard looking for money that is already accounted for. The
 * precedent is the discount-allowed expense, which blanks the same field for
 * the same reason.
 */
const mirrorNotes = (loan: LoanMirrorSource, direction: "paid" | "received") => {
    const account = loan.account_name?.trim();
    return [
        `Loan profit ${direction} - ${loan.lender_name || "Unknown"}${account ? ` (${account})` : ""}`,
        loan.notes?.trim(),
    ].filter(Boolean).join("\n");
};

/**
 * Make the books agree with this loan row.
 *
 * A profit payment is the cost of borrowing and a profit receipt is real
 * income, but Loan Management was the only place either was recorded - so a
 * year of interest paid never once showed up in the profit-and-loss. This
 * writes the twin that fixes that.
 *
 * The twin never carries an account_id. The loan row has already moved the
 * cash: Balance.tsx sums received_amount / payment_amount per account AND sums
 * expenses and other income per account, so a twin naming the same account
 * would take the money out twice. Every P&L reader - the Dashboard, the three
 * report pages, ShareholderDashboard, lib/profit.ts - sums with no account
 * filter at all, which is why a row with no account still lands in the profit
 * exactly as it should.
 *
 * Must be called inside the same transaction as the write that changed the
 * loan. A twin written by a second HTTP call is a twin that a dropped
 * connection can orphan, which is how the two frontend precedents for a derived
 * row both leak.
 *
 * Returns the links so the caller can answer with a fresh row without re-reading.
 */
export const reconcileLoanProfitMirror = async (
    tx: Tx,
    loan: LoanMirrorSource,
    user: IRequestUser
): Promise<{ expense_id: string | null; other_income_id: string | null }> => {
    const plan = planLoanMirror(loan, loan);

    let expenseId = loan.expense_id ?? null;
    let otherIncomeId = loan.other_income_id ?? null;

    // ---- profit PAID -> Expenses --------------------------------------------
    if (plan.expense === "create" || plan.expense === "update") {
        const data = {
            date: loan.date,
            category_id: loan.expense_category_id,
            category_name: loan.expense_category_name?.trim() || UNCATEGORISED,
            amount: plan.amount,
            account_id: null,
            account_name: "",
            notes: mirrorNotes(loan, "paid"),
        };

        if (plan.expense === "update" && expenseId) {
            // updateMany rather than update: scoped by owner_id like every other
            // write here, and a count of 0 instead of a throw when the row has
            // gone. It should not have - deleteExpense refuses a loan-owned row -
            // but a link that went stale should be repaired, not fatal.
            const touched = await tx.expense.updateMany({
                where: { id: expenseId, owner_id: user.ownerId },
                data,
            });
            if (touched.count === 0) expenseId = null;
        }

        if (!expenseId) {
            const created = await tx.expense.create({
                data: { ...data, owner_id: user.ownerId, created_by: user.userId },
            });
            expenseId = created.id;
        }
    } else if (plan.expense === "delete" && expenseId) {
        // The row stopped being a profit payment - corrected to principal, or to
        // a receipt. Hard delete, and deliberately NOT into the recycle bin: a
        // twin restorable on its own is an expense with no loan behind it, which
        // is the double count arriving by another door.
        await tx.expense.deleteMany({ where: { id: expenseId, owner_id: user.ownerId } });
        expenseId = null;
    }

    // ---- profit RECEIVED -> Other Income ------------------------------------
    if (plan.other_income === "create" || plan.other_income === "update") {
        const data = {
            date: loan.date,
            // Other Income has no category table - income_type plus a free-text
            // source is its whole classification, so the lender's name IS the
            // classification. Nothing to pick, which is why the form asks for a
            // category on one side of this and not the other.
            income_type: IncomeType.other,
            supplier_id: null,
            supplier_name: "",
            // What the owner wrote when entering the transaction, falling back
            // to the lender's name. The name alone says who paid but not what
            // for, and this row is read months later on a report with no way
            // back to the loan behind it.
            source_name: loan.income_source_name?.trim() || loan.lender_name || "Unknown",
            amount: plan.amount,
            account_id: null,
            account_name: "",
            notes: mirrorNotes(loan, "received"),
        };

        if (plan.other_income === "update" && otherIncomeId) {
            const touched = await tx.otherIncome.updateMany({
                where: { id: otherIncomeId, owner_id: user.ownerId },
                data,
            });
            if (touched.count === 0) otherIncomeId = null;
        }

        if (!otherIncomeId) {
            const created = await tx.otherIncome.create({
                data: { ...data, owner_id: user.ownerId, created_by: user.userId },
            });
            otherIncomeId = created.id;
        }
    } else if (plan.other_income === "delete" && otherIncomeId) {
        await tx.otherIncome.deleteMany({ where: { id: otherIncomeId, owner_id: user.ownerId } });
        otherIncomeId = null;
    }

    // Both foreign keys are ON DELETE SET NULL, so a delete above has already
    // blanked its column - but a create has not, and writing both together is
    // one statement either way.
    if (expenseId !== (loan.expense_id ?? null) || otherIncomeId !== (loan.other_income_id ?? null)) {
        await tx.loan.update({
            where: { id: loan.id },
            data: { expense_id: expenseId, other_income_id: otherIncomeId },
        });
    }

    return { expense_id: expenseId, other_income_id: otherIncomeId };
};
