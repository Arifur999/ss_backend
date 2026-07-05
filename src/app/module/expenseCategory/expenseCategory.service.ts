import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateExpenseCategoryPayload, IUpdateExpenseCategoryPayload } from "./expenseCategory.validation.js";

const getAllCategories = async (user: IRequestUser) => {
    return prisma.expenseCategory.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { created_at: "asc" },
    });
};

const createCategory = async (payload: ICreateExpenseCategoryPayload, user: IRequestUser) => {
    return prisma.expenseCategory.create({
        data: { ...payload, owner_id: user.ownerId },
    });
};

const updateCategory = async (id: string, payload: IUpdateExpenseCategoryPayload, user: IRequestUser) => {
    const existing = await prisma.expenseCategory.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Expense category not found");
    }

    return prisma.expenseCategory.update({
        where: { id },
        data: payload,
    });
};

// Mirrors the old guard_expense_category_deletes trigger: block deleting a
// category that still has expense transactions.
const deleteCategory = async (id: string, user: IRequestUser) => {
    const existing = await prisma.expenseCategory.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Expense category not found");
    }

    const expenseCount = await prisma.expense.count({
        where: { category_id: id, owner_id: user.ownerId },
    });

    if (expenseCount > 0) {
        throw new AppError(
            status.CONFLICT,
            "This category has expense transactions. Delete those transactions first."
        );
    }

    await prisma.expenseCategory.delete({ where: { id } });

    return { message: "Expense category deleted successfully" };
};

export const ExpenseCategoryService = {
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
};
