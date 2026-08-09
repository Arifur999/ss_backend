import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { ICreateAccountTransferPayload, IUpdateAccountTransferPayload } from "./accountTransfer.validation.js";

const getAllTransfers = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.accountTransfer.findMany({
        where: { owner_id: user.ownerId, ...dateRangeWhere(options) },
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

// Balances are derived from these rows rather than stored on the accounts, so
// correcting a transfer is just correcting the row - there is no old movement
// to reverse first.
const updateTransfer = async (id: string, payload: IUpdateAccountTransferPayload, user: IRequestUser) => {
    const existing = await prisma.accountTransfer.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Transfer not found");
    }

    // Either side may be left out of the payload, so check the values the row
    // would end up with, not just the ones that were sent.
    const from = payload.from_account_id ?? existing.from_account_id;
    const to = payload.to_account_id ?? existing.to_account_id;
    if (from === to) {
        throw new AppError(status.BAD_REQUEST, "Cannot transfer to the same account");
    }

    return prisma.accountTransfer.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
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
    updateTransfer,
    deleteTransfer,
};
