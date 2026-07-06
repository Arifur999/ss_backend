import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateProfitWithdrawalPayload, IUpdateProfitWithdrawalPayload } from "./profitWithdrawal.validation.js";

const getAllProfitWithdrawals = async (user: IRequestUser) => {
    return prisma.profitWithdrawal.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createProfitWithdrawal = async (payload: ICreateProfitWithdrawalPayload, user: IRequestUser) => {
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
