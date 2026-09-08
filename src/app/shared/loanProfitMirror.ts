import { PRINCIPAL, PROFIT, type LoanRow } from "./loanBalance.js";
import { roundTaka } from "./money.js";

// ---------------------------------------------------------------------------
// Which book a loan profit row belongs in, and what to do about the row that is
// already there.
//
// A profit payment is the cost of borrowing and a profit receipt is real
// income, but Loan Management was the only place either was ever recorded - so
// a year of interest paid never once appeared in the profit-and-loss. Every
// profit row now writes a twin: paid becomes an expense, received becomes an
// other-income.
//
// This module is the deciding, kept apart from the Prisma writes, because this
// is the part with all the cases in it: principal becomes profit, profit
// becomes principal, a profit PAYMENT is corrected to a profit RECEIPT, an
// amount is edited, a row comes back from the recycle bin. Every one of those
// has to leave exactly one twin, or none, and never two. That is a truth table,
// and a truth table belongs somewhere a test can reach without a database.
//
// Pure - only loanBalance and money, no Prisma and no env - so the test beside
// it runs in CI, which has no .env.
// ---------------------------------------------------------------------------

export const EXPENSE = "expense";
export const OTHER_INCOME = "other_income";

export type MirrorKind = typeof EXPENSE | typeof OTHER_INCOME | null;

/** What the reconcile may do to one of the two twins. */
export type MirrorAction = "none" | "create" | "update" | "delete";

export type MirrorPlan = {
    kind: MirrorKind;
    amount: number;
    expense: MirrorAction;
    other_income: MirrorAction;
};

/** The twins a loan row currently points at. */
export type MirrorLinks = {
    expense_id?: string | null;
    other_income_id?: string | null;
};

/**
 * Which book this row belongs in - decided by the MONEY, not by the label.
 *
 * received_amount and payment_amount are the two columns Balance.tsx folds into
 * an account. Keying the twin off transaction_type instead would let a row
 * whose label and amounts disagree write an expense for a different figure than
 * the one that actually left the account. transaction_type only breaks a tie,
 * and only for a row carrying both - which no form can produce.
 *
 * A profit row of Tk 0 gets no twin at all: an expense of nothing is noise in a
 * ledger somebody reads by eye.
 */
export const mirrorKindOf = (loan: LoanRow): MirrorKind => {
    if (String(loan.payment_category || PRINCIPAL) !== PROFIT) return null;

    const paid = roundTaka(loan.payment_amount);
    const received = roundTaka(loan.received_amount);

    if (paid > 0 && received > 0) {
        return loan.transaction_type === "receive" ? OTHER_INCOME : EXPENSE;
    }
    if (paid > 0) return EXPENSE;
    if (received > 0) return OTHER_INCOME;
    return null;
};

/** What the twin is worth - the same figure the cash account moved by. */
export const mirrorAmountOf = (loan: LoanRow): number => {
    const kind = mirrorKindOf(loan);
    if (kind === EXPENSE) return roundTaka(loan.payment_amount);
    if (kind === OTHER_INCOME) return roundTaka(loan.received_amount);
    return 0;
};

/**
 * What to do to each twin so the books match this row.
 *
 * The two sides are decided independently, which is what makes the awkward
 * transitions fall out for free rather than each needing a case of its own:
 * correcting a profit PAYMENT to a profit RECEIPT is simply "delete the
 * expense" and "create the other income", computed separately and both true.
 */
export const planLoanMirror = (loan: LoanRow, links: MirrorLinks): MirrorPlan => {
    const kind = mirrorKindOf(loan);

    const side = (wanted: boolean, existing: string | null | undefined): MirrorAction => {
        if (wanted) return existing ? "update" : "create";
        return existing ? "delete" : "none";
    };

    return {
        kind,
        amount: mirrorAmountOf(loan),
        expense: side(kind === EXPENSE, links.expense_id),
        other_income: side(kind === OTHER_INCOME, links.other_income_id),
    };
};

/**
 * True when this row is the kind that must name an expense category.
 *
 * One rule, four call sites: the create schema's refine, the update path's
 * check against the merged row, the browser's validation, and whether the
 * browser even shows the picker. They were always going to be written four
 * times; this is them being written once.
 *
 * Nothing is asked for on the receiving side - Other Income has no categories
 * at all, and the lender's name is its whole classification.
 */
export const needsExpenseCategory = (loan: LoanRow): boolean =>
    mirrorKindOf(loan) === EXPENSE;
