import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateLoanLenderPayload, IUpdateLoanLenderPayload } from "./loanLender.validation.js";

const getAllLenders = async (user: IRequestUser) => {
    return prisma.loanLender.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: { created_at: "desc" },
    });
};

const createLender = async (payload: ICreateLoanLenderPayload, user: IRequestUser) => {
    return prisma.loanLender.create({
        data: { ...payload, owner_id: user.ownerId, created_by: user.userId },
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
        data: payload,
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
