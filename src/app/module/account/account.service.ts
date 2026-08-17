import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
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

const deleteAccount = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.account.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Account not found");
    }

    // Snapshot before the row goes, so the Recycle Bin can actually return it.
    // The frontend already offered "deleted - restorable" for these, and the
    // recycle-bin page already lists a tab for them, but no snapshot was ever
    // written: the record was gone for good and the bin stayed empty.
    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "accounts",
                row: existing,
                meta: recycleMeta,
                fallbackType: "balance",
                fallbackTitle: String(existing.name ?? ""),
                fallbackSubtitle: existing.type ?? "",
                fallbackAmount: existing.opening_balance,
            }),
        });

        await tx.account.delete({ where: { id } });
    });

    return { message: "Account deleted successfully" };
};

export const AccountService = {
    getAllAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
};
