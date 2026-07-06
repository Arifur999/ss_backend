import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateLoanPayload, IUpdateLoanPayload } from "./loan.validation.js";

const getAllLoans = async (user: IRequestUser) => {
    return prisma.loan.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createLoan = async (payload: ICreateLoanPayload, user: IRequestUser) => {
    return prisma.loan.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updateLoan = async (id: string, payload: IUpdateLoanPayload, user: IRequestUser) => {
    const existing = await prisma.loan.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Loan transaction not found");
    }

    return prisma.loan.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
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
                row: existing,
                meta: recycleMeta,
                fallbackType: "loanManagement",
                fallbackTitle: existing.lender_name,
                fallbackAmount: existing.received_amount,
            }),
        });
        await tx.loan.delete({ where: { id } });
    });

    return { message: "Loan transaction moved to recycle bin" };
};

export const LoanService = {
    getAllLoans,
    createLoan,
    updateLoan,
    deleteLoan,
};
