import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { lenderKeyOf, runningStatement } from "../../shared/loanBalance.js";
import { needsExpenseCategory } from "../../shared/loanProfitMirror.js";
import { roundTaka } from "../../shared/money.js";
import { ICreateLoanPayload, IUpdateLoanPayload } from "./loan.validation.js";
import { reconcileLoanProfitMirror } from "./profitMirror.helpers.js";

/**
 * The rule createLoanZodSchema's .refine enforces, applied where a PATCH can be
 * judged by it too.
 *
 * A PATCH may carry nothing but `notes`, so the schema cannot see what the row
 * will BE - only the payload merged over the existing row can, and that merge
 * exists only here.
 */
const assertProfitHasCategory = (merged: {
    payment_category?: string | null;
    transaction_type?: string | null;
    received_amount?: unknown;
    payment_amount?: unknown;
    expense_category_id?: string | null;
}) => {
    if (needsExpenseCategory(merged) && !merged.expense_category_id) {
        throw new AppError(
            status.BAD_REQUEST,
            "Choose an expense category - profit paid is recorded as an expense"
        );
    }
};

const getAllLoans = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.loan.findMany({
        where: { owner_id: user.ownerId, deleted_at: null, ...dateRangeWhere(options) },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

/**
 * One lender's account over one window, the way a passbook reads.
 *
 * The opening balance is the whole point: everything before `from` is summed
 * into a single carried-forward figure, so a statement for September starts
 * exactly where August closed. Computing that in the browser would mean
 * downloading every transaction the business has ever made to show one month.
 *
 * Rows are keyed the way loanBalance keys them, so a lender whose older rows
 * predate their lender_id still gets all of their money on one statement.
 */
const getLenderStatement = async (
    input: { lenderId: string; from?: string; to?: string },
    user: IRequestUser
) => {
    const lender = await prisma.loanLender.findFirst({
        where: { id: input.lenderId, owner_id: user.ownerId, deleted_at: null },
    });

    if (!lender) {
        throw new AppError(status.NOT_FOUND, "Bank / person not found");
    }

    // Old rows carry only a name, so match on either - the same rule
    // lenderKeyOf applies, expressed as a query.
    const belongsToLender = {
        OR: [
            { lender_id: lender.id },
            { lender_id: null, lender_name: lender.name },
        ],
    };

    const all = await prisma.loan.findMany({
        where: { owner_id: user.ownerId, deleted_at: null, ...belongsToLender },
        orderBy: [{ date: "asc" }, { created_at: "asc" }],
    });

    // Split rather than query twice: the window bounds are a date comparison
    // either way, and one read keeps the two halves consistent.
    const fromDate = input.from ? new Date(`${input.from}T00:00:00.000Z`) : null;
    const toDate = input.to ? new Date(`${input.to}T23:59:59.999Z`) : null;

    const before = all.filter((loan) => fromDate !== null && loan.date < fromDate);
    const within = all.filter((loan) =>
        (fromDate === null || loan.date >= fromDate) &&
        (toDate === null || loan.date <= toDate)
    );

    // Everything before the window, folded into one number.
    const openingPrincipal = runningStatement(roundTaka(lender.opening_balance), before).closing_principal;
    const statement = runningStatement(openingPrincipal, within);

    return {
        lender: {
            id: lender.id, name: lender.name, phone: lender.phone,
            address: lender.address, opening_balance: lender.opening_balance,
            key: lenderKeyOf(lender),
        },
        from: input.from ?? null,
        to: input.to ?? null,
        ...statement,
    };
};

const createLoan = async (payload: ICreateLoanPayload, user: IRequestUser) => {
    // Every id in the payload has to point at a row in this workspace. Nothing
    // checked that before, and an id is all it takes to link to a record - so
    // posting another owner's account_id or customer_id attached their row to
    // this transaction, and any response that joins it handed their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        lender_id: "loanLender",
        expense_category_id: "expenseCategory",
    });

    return prisma.$transaction(async (tx) => {
        const loan = await tx.loan.create({
            data: {
                ...payload,
                date: new Date(payload.date),
                owner_id: user.ownerId,
                created_by: user.userId,
            },
        });

        // In the same transaction as the loan, on purpose. Both frontend
        // precedents for a derived money row do it over separate HTTP calls -
        // CustomerDueReceived writes an expense nothing ever deletes,
        // EmployeeTransactions needs three round trips - and either one leaves
        // an orphan the moment a request fails halfway.
        const links = await reconcileLoanProfitMirror(tx, loan, user);
        return { ...loan, ...links };
    });
};

const updateLoan = async (id: string, payload: IUpdateLoanPayload, user: IRequestUser) => {
    const existing = await prisma.loan.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Loan transaction not found");
    }

    // The same check createLoan makes, which this path was missing: without it
    // a PATCH could re-point account_id or lender_id at another workspace's row
    // and any response that joins them would hand their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        lender_id: "loanLender",
        expense_category_id: "expenseCategory",
    });

    // Judged on what the row will be, not on what was sent.
    assertProfitHasCategory({ ...existing, ...payload });

    return prisma.$transaction(async (tx) => {
        const loan = await tx.loan.update({
            where: { id },
            data: {
                ...payload,
                date: payload.date ? new Date(payload.date) : undefined,
            },
        });

        // `loan` is the row as it now stands, links included, so the reconcile
        // judges and repairs off the same object.
        const links = await reconcileLoanProfitMirror(tx, loan, user);
        return { ...loan, ...links };
    });
};

const deleteLoan = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.loan.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Loan transaction not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "loans",
                // The two twin ids are stripped from the snapshot on purpose.
                //
                // They point at rows deleted three lines below. Restoring the
                // snapshot as written would recreate the loan holding a foreign
                // key to a row that no longer exists, and Postgres would refuse
                // the whole restore - not just the link. The category and the
                // amounts stay, which is what lets restoreItem REBUILD the twin
                // rather than try to resurrect it.
                row: { ...existing, expense_id: null, other_income_id: null },
                meta: recycleMeta,
                fallbackType: "loanManagement",
                fallbackTitle: existing.lender_name,
                fallbackAmount: existing.received_amount,
            }),
        });

        // The twin goes with it, silently and with no bin entry of its own.
        // Leaving it would keep a cost in the P&L for a payment the ledger no
        // longer says happened; binning it separately would let it be restored
        // alone, which is the same disagreement upside down.
        if (existing.expense_id) {
            await tx.expense.deleteMany({ where: { id: existing.expense_id, owner_id: user.ownerId } });
        }
        if (existing.other_income_id) {
            await tx.otherIncome.deleteMany({ where: { id: existing.other_income_id, owner_id: user.ownerId } });
        }

        await tx.loan.delete({ where: { id } });
    });

    return { message: "Loan transaction moved to recycle bin" };
};

export const LoanService = {
    getLenderStatement,
    getAllLoans,
    createLoan,
    updateLoan,
    deleteLoan,
};
