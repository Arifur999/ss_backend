import { roundTaka } from "./money.js";

// ---------------------------------------------------------------------------
// What a lender owes, and what we earned on it.
//
// One copy of this arithmetic, on the server, because it had been three: the
// dashboard, the ledger and the transaction form each rebuilt it in the browser
// and had already drifted apart. It is pure - no Prisma, no env - so the test
// beside it runs in CI, which has no .env.
//
// THE SIGN CONVENTION, which everything here depends on:
//   positive = pawna = they owe us
//   negative = dena  = we owe them
//
// Taking money from a lender puts us in their debt, so a `receive` moves the
// balance DOWN. Paying them back moves it UP toward zero. Get this backwards
// and every screen tells somebody they owe money they are in fact owed.
// ---------------------------------------------------------------------------

export type BalanceType = "RECEIVABLE" | "PAYABLE" | "SETTLED";

export type LoanRow = {
    lender_id?: string | null;
    lender_name?: string | null;
    transaction_type?: string | null;
    payment_category?: string | null;
    received_amount?: unknown;
    payment_amount?: unknown;
};

export type LenderRow = {
    id?: string | null;
    name?: string | null;
    opening_balance?: unknown;
};

export const PRINCIPAL = "principal";
export const PROFIT = "profit";

const isProfit = (loan: LoanRow) => String(loan.payment_category || PRINCIPAL) === PROFIT;

/** What a row actually moved, whatever it was labelled. */
const received = (loan: LoanRow) => roundTaka(loan.received_amount);
const paid = (loan: LoanRow) => roundTaka(loan.payment_amount);

/**
 * How much this row moves the principal owed.
 *
 * A profit row moves it by nothing. That is the entire point of the upgrade:
 * interest used to be added with the same sign as a repayment, so earning
 * interest looked like the debt shrinking.
 */
export const principalEffect = (loan: LoanRow): number =>
    isProfit(loan) ? 0 : paid(loan) - received(loan);

/**
 * The bucket a row belongs to.
 *
 * Old rows carry a lender_name and no lender_id, and the browser used to key
 * lenders one way and loans another - so one person with both kinds of row
 * showed up twice on the dashboard, each with half their money. Both sides key
 * through here now.
 */
export const lenderKeyOf = (row: { id?: string | null; lender_id?: string | null; name?: string | null; lender_name?: string | null }): string => {
    // A lender parked in the browser's localStorage fallback has a synthetic
    // "local:"/"legacy:" id that no loan row can reference, so it keys by name
    // like the rows themselves do.
    const id = row.lender_id ?? row.id ?? null;
    if (id && !String(id).startsWith("local:") && !String(id).startsWith("legacy:")) return String(id);
    const name = row.lender_name ?? row.name ?? "Unknown";
    return `name:${String(name).trim() || "Unknown"}`;
};

export const balanceTypeOf = (principal: number): BalanceType => {
    if (principal > 0) return "RECEIVABLE";
    if (principal < 0) return "PAYABLE";
    return "SETTLED";
};

export type LenderBalances = {
    current_principal: number;
    profit_received: number;
    profit_paid: number;
    /** Profit earned net of profit given away. */
    total_profit: number;
    principal_received: number;
    principal_paid: number;
    balance_type: BalanceType;
    transactions: number;
};

/** Where one lender stands, opening balance included. */
export const lenderBalances = (lender: LenderRow, loans: LoanRow[]): LenderBalances => {
    let current_principal = roundTaka(lender.opening_balance);
    let profit_received = 0;
    let profit_paid = 0;
    let principal_received = 0;
    let principal_paid = 0;

    for (const loan of loans) {
        if (isProfit(loan)) {
            profit_received += received(loan);
            profit_paid += paid(loan);
        } else {
            principal_received += received(loan);
            principal_paid += paid(loan);
            current_principal += principalEffect(loan);
        }
    }

    return {
        current_principal: roundTaka(current_principal),
        profit_received: roundTaka(profit_received),
        profit_paid: roundTaka(profit_paid),
        total_profit: roundTaka(profit_received - profit_paid),
        principal_received: roundTaka(principal_received),
        principal_paid: roundTaka(principal_paid),
        balance_type: balanceTypeOf(roundTaka(current_principal)),
        transactions: loans.length,
    };
};

/** Every lender's position in one pass, keyed so a person cannot split in two. */
export const lenderBalancesByKey = (lenders: LenderRow[], loans: LoanRow[]) => {
    const loansByKey = new Map<string, LoanRow[]>();
    for (const loan of loans) {
        const key = lenderKeyOf(loan);
        const bucket = loansByKey.get(key);
        if (bucket) bucket.push(loan);
        else loansByKey.set(key, [loan]);
    }

    const result = new Map<string, LenderBalances>();
    for (const lender of lenders) {
        const key = lenderKeyOf(lender);
        result.set(key, lenderBalances(lender, loansByKey.get(key) ?? []));
    }

    // Rows whose lender was deleted, or which never had one, still hold money.
    // Dropping them would make the totals disagree with the ledger.
    for (const [key, bucket] of loansByKey) {
        if (!result.has(key)) result.set(key, lenderBalances({ opening_balance: 0 }, bucket));
    }

    return result;
};

export type StatementRow<T> = {
    row: T;
    /** Money out of our pocket - a repayment, or profit handed over. */
    debit: number;
    /** Money into our pocket. */
    credit: number;
    is_profit: boolean;
    /** Unchanged by a profit row, which is the rule the statement exists for. */
    running_principal: number;
};

export type Statement<T> = {
    opening_principal: number;
    rows: StatementRow<T>[];
    total_paid: number;
    total_received: number;
    total_profit: number;
    closing_principal: number;
};

/**
 * A bank statement over one lender for one window.
 *
 * `loans` must already be the window, in date order oldest first, and
 * `openingPrincipal` must already carry everything before it - work the caller
 * does because only it knows the range.
 */
export const runningStatement = <T extends LoanRow>(openingPrincipal: number, loans: T[]): Statement<T> => {
    let running = roundTaka(openingPrincipal);
    let total_paid = 0;
    let total_received = 0;
    let total_profit = 0;

    const rows = loans.map((loan): StatementRow<T> => {
        const debit = paid(loan);
        const credit = received(loan);
        const profitRow = isProfit(loan);

        total_paid += debit;
        total_received += credit;
        if (profitRow) total_profit += credit - debit;

        running = roundTaka(running + principalEffect(loan));

        return { row: loan, debit, credit, is_profit: profitRow, running_principal: running };
    });

    return {
        opening_principal: roundTaka(openingPrincipal),
        rows,
        total_paid: roundTaka(total_paid),
        total_received: roundTaka(total_received),
        total_profit: roundTaka(total_profit),
        closing_principal: running,
    };
};
