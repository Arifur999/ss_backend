import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateOtherIncomePayload, IUpdateOtherIncomePayload } from "./otherIncome.validation.js";

const getAllOtherIncomes = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.otherIncome.findMany({
        where: { owner_id: user.ownerId, ...dateRangeWhere(options) },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createOtherIncome = async (payload: ICreateOtherIncomePayload, user: IRequestUser) => {
    // Every id in the payload has to point at a row in this workspace. Nothing
    // checked that before, and an id is all it takes to link to a record - so
    // posting another owner's account_id or customer_id attached their row to
    // this transaction, and any response that joins it handed their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        supplier_id: "supplier",
    });

    return prisma.otherIncome.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

/**
 * Refuse to touch an other-income row the loan ledger owns.
 *
 * The mirror image of assertNotLoanOwned in expense.service.ts: a loan profit
 * RECEIPT writes this row so the profit-and-loss can see the interest earned,
 * and Loan Transactions is where it is edited. Deleting it here would drop the
 * income while the loan still says it came in.
 */
const assertNotLoanOwned = async (incomeId: string, ownerId: string) => {
    const owned = await prisma.loan.count({
        where: { other_income_id: incomeId, owner_id: ownerId },
    });

    if (owned > 0) {
        throw new AppError(
            status.CONFLICT,
            "This income comes from a loan profit receipt. Edit or delete it from Loan Transactions."
        );
    }
};

const updateOtherIncome = async (id: string, payload: IUpdateOtherIncomePayload, user: IRequestUser) => {
    const existing = await prisma.otherIncome.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Other income record not found");
    }

    await assertNotLoanOwned(id, user.ownerId);

    return prisma.otherIncome.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deleteOtherIncome = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.otherIncome.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Other income record not found");
    }

    await assertNotLoanOwned(id, user.ownerId);

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "other_incomes",
                row: existing,
                meta: recycleMeta,
                fallbackType: "purchase",
                fallbackTitle: existing.income_type === "supplier" ? existing.supplier_name : existing.source_name,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.otherIncome.delete({ where: { id } });
    });

    return { message: "Other income moved to recycle bin" };
};

export const OtherIncomeService = {
    getAllOtherIncomes,
    createOtherIncome,
    updateOtherIncome,
    deleteOtherIncome,
};
