import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { lenderBalancesByKey, lenderKeyOf } from "../../shared/loanBalance.js";
import { ICreateLoanLenderPayload, IUpdateLoanLenderPayload } from "./loanLender.validation.js";

/**
 * Every lender, with where they stand.
 *
 * The balance is computed here rather than stored, because a stored one goes
 * wrong the moment a transaction is edited or deleted - and these are edited
 * often. It is also computed HERE rather than in the browser, where three
 * pages each had their own copy and had already drifted apart.
 *
 * One extra query for the whole page, not one per lender.
 */
const getAllLenders = async (user: IRequestUser) => {
    const [lenders, loans] = await Promise.all([
        prisma.loanLender.findMany({
            where: { owner_id: user.ownerId, deleted_at: null },
            orderBy: { created_at: "desc" },
        }),
        prisma.loan.findMany({
            where: { owner_id: user.ownerId, deleted_at: null },
            select: {
                lender_id: true, lender_name: true, payment_category: true,
                received_amount: true, payment_amount: true, transaction_type: true,
            },
        }),
    ]);

    const byKey = lenderBalancesByKey(lenders, loans);

    return lenders.map((lender) => ({
        ...lender,
        ...(byKey.get(lenderKeyOf(lender)) ?? {
            current_principal: Number(lender.opening_balance ?? 0),
            profit_received: 0, profit_paid: 0, total_profit: 0,
            principal_received: 0, principal_paid: 0,
            balance_type: "SETTLED" as const, transactions: 0,
        }),
    }));
};

/**
 * Dates arrive as "YYYY-MM-DD" strings and the column is a DateTime, so the
 * payload cannot go straight through - Prisma rejects the string and the whole
 * save comes back as "Invalid data sent to database", which tells the operator
 * nothing about which field was wrong.
 *
 * Three cases, and they are not the same: absent means leave it alone, null
 * means clear it, a string means set it.
 */
const withParsedDates = <T extends { opening_date?: string | null }>(payload: T) => {
    const { opening_date, ...rest } = payload;
    if (opening_date === undefined) return rest;
    return { ...rest, opening_date: opening_date ? new Date(opening_date) : null };
};

const createLender = async (payload: ICreateLoanLenderPayload, user: IRequestUser) => {
    return prisma.loanLender.create({
        data: { ...withParsedDates(payload), owner_id: user.ownerId, created_by: user.userId },
    });
};

const updateLender = async (id: string, payload: IUpdateLoanLenderPayload, user: IRequestUser) => {
    const existing = await prisma.loanLender.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Loan lender not found");
    }

    return prisma.loanLender.update({
        where: { id },
        data: withParsedDates(payload),
    });
};

// Mirrors the old guard_loan_lender_deletes trigger: block deleting a lender
// that still has loan transactions.
const deleteLender = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.loanLender.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Loan lender not found");
    }

    const loanCount = await prisma.loan.count({
        where: { lender_id: id, owner_id: user.ownerId, deleted_at: null },
    });

    if (loanCount > 0) {
        throw new AppError(
            status.CONFLICT,
            "This lender has loan transactions. Delete those transactions first."
        );
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "loan_lenders",
                row: existing,
                meta: recycleMeta,
                fallbackType: "loanManagement",
                fallbackTitle: existing.name,
                fallbackAmount: existing.opening_balance,
            }),
        });
        await tx.loanLender.delete({ where: { id } });
    });

    return { message: "Loan lender moved to recycle bin" };
};

export const LoanLenderService = {
    getAllLenders,
    createLender,
    updateLender,
    deleteLender,
};
