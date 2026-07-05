import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateAccountTransferPayload } from "./accountTransfer.validation.js";

const getAllTransfers = async (user: IRequestUser) => {
    return prisma.accountTransfer.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createTransfer = async (payload: ICreateAccountTransferPayload, user: IRequestUser) => {
    if (payload.from_account_id === payload.to_account_id) {
        throw new AppError(status.BAD_REQUEST, "Cannot transfer to the same account");
    }

    return prisma.accountTransfer.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const deleteTransfer = async (id: string, user: IRequestUser) => {
    const existing = await prisma.accountTransfer.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Transfer not found");
    }

    await prisma.accountTransfer.delete({ where: { id } });

    return { message: "Transfer deleted successfully" };
};

export const AccountTransferService = {
    getAllTransfers,
    createTransfer,
    deleteTransfer,
};
