import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateAccountPayload, IUpdateAccountPayload } from "./account.validation.js";

const getAllAccounts = async (user: IRequestUser) => {
    return prisma.account.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
};

const createAccount = async (payload: ICreateAccountPayload, user: IRequestUser) => {
    return prisma.account.create({
        data: { ...payload, owner_id: user.ownerId },
    });
};

const updateAccount = async (id: string, payload: IUpdateAccountPayload, user: IRequestUser) => {
    const existing = await prisma.account.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Account not found");
    }

    return prisma.account.update({
        where: { id },
        data: payload,
    });
};

const deleteAccount = async (id: string, user: IRequestUser) => {
    const existing = await prisma.account.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Account not found");
    }

    await prisma.account.delete({ where: { id } });

    return { message: "Account deleted successfully" };
};

export const AccountService = {
    getAllAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
};
