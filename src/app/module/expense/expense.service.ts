import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateExpensePayload, IUpdateExpensePayload } from "./expense.validation.js";

const getAllExpenses = async (user: IRequestUser) => {
    return prisma.expense.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createExpense = async (payload: ICreateExpensePayload, user: IRequestUser) => {
    return prisma.expense.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updateExpense = async (id: string, payload: IUpdateExpensePayload, user: IRequestUser) => {
    const existing = await prisma.expense.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Expense not found");
    }

    return prisma.expense.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deleteExpense = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.expense.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Expense not found");
    }

    await prisma.$transaction(async (tx) => {
        // Salary transactions may reference this expense; detach them first.
        await tx.salaryTransaction.updateMany({
            where: { expense_id: id, owner_id: user.ownerId },
            data: { expense_id: null },
        });

        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "expenses",
                row: existing,
                meta: recycleMeta,
                fallbackType: "expenses",
                fallbackTitle: existing.category_name,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.expense.delete({ where: { id } });
    });

    return { message: "Expense moved to recycle bin" };
};

export const ExpenseService = {
    getAllExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
};
