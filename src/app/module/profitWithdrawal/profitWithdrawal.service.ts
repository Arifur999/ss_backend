import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateProfitWithdrawalPayload, IUpdateProfitWithdrawalPayload } from "./profitWithdrawal.validation.js";

const getAllProfitWithdrawals = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.profitWithdrawal.findMany({
        where: { owner_id: user.ownerId, ...dateRangeWhere(options) },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createProfitWithdrawal = async (payload: ICreateProfitWithdrawalPayload, user: IRequestUser) => {
    // Every id in the payload has to point at a row in this workspace. Nothing
    // checked that before, and an id is all it takes to link to a record - so
    // posting another owner's account_id or customer_id attached their row to
    // this transaction, and any response that joins it handed their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        shareholder_id: "shareholder",
    });

    return prisma.profitWithdrawal.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updateProfitWithdrawal = async (id: string, payload: IUpdateProfitWithdrawalPayload, user: IRequestUser) => {
    const existing = await prisma.profitWithdrawal.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Profit withdrawal not found");
    }

    return prisma.profitWithdrawal.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deleteProfitWithdrawal = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.profitWithdrawal.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Profit withdrawal not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "profit_withdrawals",
                row: existing,
                meta: recycleMeta,
                fallbackType: "transactions",
                fallbackTitle: existing.shareholder_name,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.profitWithdrawal.delete({ where: { id } });
    });

    return { message: "Profit withdrawal moved to recycle bin" };
};

export const ProfitWithdrawalService = {
    getAllProfitWithdrawals,
    createProfitWithdrawal,
    updateProfitWithdrawal,
    deleteProfitWithdrawal,
};
