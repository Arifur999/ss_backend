import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateOtherIncomePayload, IUpdateOtherIncomePayload } from "./otherIncome.validation.js";

const getAllOtherIncomes = async (user: IRequestUser) => {
    return prisma.otherIncome.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createOtherIncome = async (payload: ICreateOtherIncomePayload, user: IRequestUser) => {
    return prisma.otherIncome.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updateOtherIncome = async (id: string, payload: IUpdateOtherIncomePayload, user: IRequestUser) => {
    const existing = await prisma.otherIncome.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Other income record not found");
    }

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
