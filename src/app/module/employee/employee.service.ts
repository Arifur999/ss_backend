import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateEmployeePayload, IUpdateEmployeePayload } from "./employee.validation.js";

const getAllEmployees = async (user: IRequestUser) => {
    return prisma.employee.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: { created_at: "desc" },
    });
};

const createEmployee = async (payload: ICreateEmployeePayload, user: IRequestUser) => {
    return prisma.employee.create({
        data: {
            ...payload,
            join_date: new Date(payload.join_date),
            resign_date: payload.resign_date ? new Date(payload.resign_date) : null,
            owner_id: user.ownerId,
        },
    });
};

const updateEmployee = async (id: string, payload: IUpdateEmployeePayload, user: IRequestUser) => {
    const existing = await prisma.employee.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Employee not found");
    }

    return prisma.employee.update({
        where: { id },
        data: {
            ...payload,
            join_date: payload.join_date ? new Date(payload.join_date) : undefined,
            resign_date:
                payload.resign_date === null
                    ? null
                    : payload.resign_date
                        ? new Date(payload.resign_date)
                        : undefined,
        },
    });
};

const deleteEmployee = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.employee.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Employee not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "employees",
                row: existing,
                meta: recycleMeta,
                fallbackType: "employees",
                fallbackTitle: existing.name,
            }),
        });
        // Salary transactions + attendance cascade with the employee.
        await tx.employee.delete({ where: { id } });
    });

    return { message: "Employee moved to recycle bin" };
};

export const EmployeeService = {
    getAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
};
