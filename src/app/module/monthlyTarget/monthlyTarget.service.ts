import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IUpsertMonthlyTargetPayload } from "./monthlyTarget.validation.js";

const getAllTargets = async (user: IRequestUser) => {
    return prisma.monthlyTarget.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
    });
};

const upsertTarget = async (payload: IUpsertMonthlyTargetPayload, user: IRequestUser) => {
    return prisma.monthlyTarget.upsert({
        where: {
            owner_id_year_month: {
                owner_id: user.ownerId,
                year: payload.year,
                month: payload.month,
            },
        },
        create: { ...payload, owner_id: user.ownerId },
        update: {
            sales_target: payload.sales_target,
            profit_target: payload.profit_target,
        },
    });
};

const deleteTarget = async (id: string, user: IRequestUser) => {
    const existing = await prisma.monthlyTarget.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Monthly target not found");
    }

    await prisma.monthlyTarget.delete({ where: { id } });

    return { message: "Monthly target deleted successfully" };
};

export const MonthlyTargetService = {
    getAllTargets,
    upsertTarget,
    deleteTarget,
};
