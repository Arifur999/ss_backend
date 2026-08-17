import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
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

const deleteShareholder = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.shareholder.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Shareholder not found");
    }

    // Snapshot before the row goes, so the Recycle Bin can actually return it.
    // The frontend already offered "deleted - restorable" for these, and the
    // recycle-bin page already lists a tab for them, but no snapshot was ever
    // written: the record was gone for good and the bin stayed empty.
    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "shareholders",
                row: existing,
                meta: recycleMeta,
                fallbackType: "transactions",
                fallbackTitle: String(existing.name ?? ""),
                fallbackSubtitle: existing.phone ?? "",
                fallbackAmount: existing.opening_amount,
            }),
        });

        await tx.shareholder.delete({ where: { id } });
    });

    return { message: "Shareholder deleted successfully" };
};

export const ShareholderService = {
    getAllShareholders,
    createShareholder,
    updateShareholder,
    deleteShareholder,
};
