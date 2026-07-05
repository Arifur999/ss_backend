import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateShareholderPayload, IUpdateShareholderPayload } from "./shareholder.validation.js";

const getAllShareholders = async (user: IRequestUser) => {
    return prisma.shareholder.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
};

const createShareholder = async (payload: ICreateShareholderPayload, user: IRequestUser) => {
    return prisma.shareholder.create({
        data: { ...payload, owner_id: user.ownerId },
    });
};

const updateShareholder = async (id: string, payload: IUpdateShareholderPayload, user: IRequestUser) => {
    const existing = await prisma.shareholder.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Shareholder not found");
    }

    return prisma.shareholder.update({
        where: { id },
        data: payload,
    });
};

const deleteShareholder = async (id: string, user: IRequestUser) => {
    const existing = await prisma.shareholder.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Shareholder not found");
    }

    await prisma.shareholder.delete({ where: { id } });

    return { message: "Shareholder deleted successfully" };
};

export const ShareholderService = {
    getAllShareholders,
    createShareholder,
    updateShareholder,
    deleteShareholder,
};
