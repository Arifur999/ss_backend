import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { dateRangeWhere, type ListOptions } from "../../shared/listQuery.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateInvestmentPayload, IUpdateInvestmentPayload } from "./investment.validation.js";

const getAllInvestments = async (user: IRequestUser, options: ListOptions = {}) => {
    return prisma.investment.findMany({
        where: { owner_id: user.ownerId, ...dateRangeWhere(options) },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createInvestment = async (payload: ICreateInvestmentPayload, user: IRequestUser) => {
    // Every id in the payload has to point at a row in this workspace. Nothing
    // checked that before, and an id is all it takes to link to a record - so
    // posting another owner's account_id or customer_id attached their row to
    // this transaction, and any response that joins it handed their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        shareholder_id: "shareholder",
    });

    return prisma.investment.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updateInvestment = async (id: string, payload: IUpdateInvestmentPayload, user: IRequestUser) => {
    const existing = await prisma.investment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Investment record not found");
    }

    return prisma.investment.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deleteInvestment = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.investment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Investment record not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "investments",
                row: existing,
                meta: recycleMeta,
                fallbackType: "transactions",
                fallbackTitle: existing.shareholder_name,
                fallbackAmount: existing.invest_amount,
            }),
        });
        await tx.investment.delete({ where: { id } });
    });

    return { message: "Investment moved to recycle bin" };
};

export const InvestmentService = {
    getAllInvestments,
    createInvestment,
    updateInvestment,
    deleteInvestment,
};
