// ---------------------------------------------------------------------------
// The expense a salary or bonus payment books.
//
// A salary_transactions row moves no money by itself: Balance and the
// profit-and-loss read expenses, so a salary only leaves its account through
// the expense that goes with it. The website writes that expense from the
// browser (EmployeeTransactions.createOrUpdateExpense) in separate requests
// after the payment; the mobile app asks the server to write both in one
// transaction instead, so a payment can never be saved without the money
// leaving the account.
//
// The row is the website's own, field for field - including the
// "SalaryTransaction:<id>" marker on the first line of its notes, which is how
// the website finds the twin again when the payment is edited or deleted.
//
// Pure - only money, no Prisma and no env - so the test beside it runs in CI.
// ---------------------------------------------------------------------------

export const salaryExpenseMarker = (transactionId: string): string => `SalaryTransaction:${transactionId}`;

export type SalaryForExpense = {
    id: string;
    employee_name?: string | null;
    payment_type?: string | null;
    date: string;
    period_from?: string | null;
    period_to?: string | null;
    amount?: unknown;
    bonus?: unknown;
    notes?: string | null;
    category_id?: string | null;
    account_id?: string | null;
};

export type SalaryExpenseData = {
    date: string;
    category_id: string;
    category_name: string;
    amount: number;
    account_id: string;
    account_name: string;
    notes: string;
};

/** What left the account: the salary or the bonus - a payment carries one of them. */
export const salaryExpenseAmount = (txn: Pick<SalaryForExpense, "amount" | "bonus">): number =>
    (Number(txn.amount) || 0) + (Number(txn.bonus) || 0);

/** The website's notes: the marker, what was paid and to whom, the period, then whatever was typed. */
export const salaryExpenseNotes = (txn: SalaryForExpense): string =>
    [
        salaryExpenseMarker(txn.id),
        `${txn.payment_type || "Salary"} payment for ${txn.employee_name || ""}`,
        txn.period_from && txn.period_to ? `Period: ${txn.period_from} to ${txn.period_to}` : "",
        txn.notes || "",
    ]
        .filter(Boolean)
        .join("\n");

/**
 * The expense row, or null when the payment cannot book one - no category, no
 * account, or nothing paid. A null is refused by the caller rather than saved
 * as a payment that moved no money.
 */
export const salaryExpenseData = (
    txn: SalaryForExpense,
    names: { category_name: string; account_name: string }
): SalaryExpenseData | null => {
    const amount = salaryExpenseAmount(txn);
    if (!txn.category_id || !txn.account_id || !(amount > 0)) return null;
    return {
        date: txn.date,
        category_id: txn.category_id,
        category_name: names.category_name,
        amount,
        account_id: txn.account_id,
        account_name: names.account_name,
        notes: salaryExpenseNotes(txn),
    };
};

/** Whether an expense is this payment's own twin - the only expense deleted along with it. */
export const isSalaryTwin = (expenseNotes: unknown, transactionId: string): boolean =>
    String(expenseNotes ?? "").includes(salaryExpenseMarker(transactionId));
