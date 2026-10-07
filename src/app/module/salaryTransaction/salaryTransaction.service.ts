import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { isSalaryTwin, salaryExpenseData } from "../../shared/salaryExpense.js";
import { ICreateSalaryTransactionPayload, IUpdateSalaryTransactionPayload } from "./salaryTransaction.validation.js";

const getAllSalaryTransactions = async (user: IRequestUser, employeeId?: string) => {
    return prisma.salaryTransaction.findMany({
        where: {
            owner_id: user.ownerId,
            ...(employeeId ? { employee_id: employeeId } : {}),
        },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

/**
 * `bookExpense` is the mobile app's request: write the payment's expense in
 * the same transaction, so the money leaves its account with it. The website
 * writes that expense itself, so its requests leave this off and are untouched.
 */
const createSalaryTransaction = async (
    payload: ICreateSalaryTransactionPayload,
    user: IRequestUser,
    options: { bookExpense?: boolean } = {}
) => {
    // Every id in the payload has to point at a row in this workspace. Nothing
    // checked that before, and an id is all it takes to link to a record - so
    // posting another owner's account_id or customer_id attached their row to
    // this transaction, and any response that joins it handed their details back.
    await assertOwnedReferences(payload, user.ownerId, {
        account_id: "account",
        category_id: "expenseCategory",
    });

    const employee = await prisma.employee.findFirst({
        where: { id: payload.employee_id, owner_id: user.ownerId },
    });

    if (!employee) {
        throw new AppError(status.NOT_FOUND, "Employee not found");
    }

    const data = {
        ...payload,
        employee_name: payload.employee_name ?? employee.name,
        date: new Date(payload.date),
        period_from: payload.period_from ? new Date(payload.period_from) : null,
        period_to: payload.period_to ? new Date(payload.period_to) : null,
        owner_id: user.ownerId,
        created_by: user.userId,
    };

    if (!options.bookExpense) {
        return prisma.salaryTransaction.create({ data });
    }

    // Names from the rows themselves, not the client: they land on the expense.
    const [category, account] = await Promise.all([
        payload.category_id ? prisma.expenseCategory.findFirst({ where: { id: payload.category_id, owner_id: user.ownerId } }) : null,
        payload.account_id ? prisma.account.findFirst({ where: { id: payload.account_id, owner_id: user.ownerId } }) : null,
    ]);
    const names = { category_name: category?.name ?? "", account_name: account?.name ?? "" };
    const planned = (id: string) =>
        salaryExpenseData({ ...payload, id, employee_name: data.employee_name, period_from: payload.period_from ?? null, period_to: payload.period_to ?? null }, names);

    // Refused up front rather than saved as a payment that moved no money.
    if (!planned("check")) {
        throw new AppError(status.BAD_REQUEST, "A salary payment needs an expense category, an account and an amount");
    }

    return prisma.$transaction(async (tx) => {
        const salary = await tx.salaryTransaction.create({ data });
        const expense = await tx.expense.create({
            data: {
                ...planned(salary.id)!,
                date: data.date,
                owner_id: user.ownerId,
                created_by: user.userId,
            },
        });
        return tx.salaryTransaction.update({ where: { id: salary.id }, data: { expense_id: expense.id } });
    });
};

const updateSalaryTransaction = async (id: string, payload: IUpdateSalaryTransactionPayload, user: IRequestUser) => {
    const existing = await prisma.salaryTransaction.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Salary transaction not found");
    }

    return prisma.salaryTransaction.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
            period_from:
                payload.period_from === null ? null : payload.period_from ? new Date(payload.period_from) : undefined,
            period_to:
                payload.period_to === null ? null : payload.period_to ? new Date(payload.period_to) : undefined,
        },
    });
};

/**
 * `withExpense` is the mobile app's request: take the payment's own expense
 * with it in the same transaction, as the website does from the browser before
 * it deletes the payment. Only the twin carrying this payment's marker goes.
 */
const deleteSalaryTransaction = async (
    id: string,
    user: IRequestUser,
    recycleMeta?: IRecycleMeta,
    options: { withExpense?: boolean } = {}
) => {
    const existing = await prisma.salaryTransaction.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Salary transaction not found");
    }

    const linked =
        options.withExpense && existing.expense_id
            ? await prisma.expense.findFirst({ where: { id: existing.expense_id, owner_id: user.ownerId } })
            : null;
    const twin = linked && isSalaryTwin(linked.notes, id) ? linked : null;

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "salary_transactions",
                // Restored later, it must not point at the expense deleted below.
                row: twin ? { ...existing, expense_id: null } : existing,
                meta: recycleMeta,
                fallbackType: "employees",
                fallbackTitle: existing.employee_name,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.salaryTransaction.delete({ where: { id } });

        if (twin) {
            // As DELETE /expenses snapshots it, so it can come back from the bin too.
            await tx.recycleBinItem.create({
                data: buildRecycleItemData({
                    user,
                    tableName: "expenses",
                    row: twin,
                    fallbackType: "expenses",
                    fallbackTitle: twin.category_name,
                    fallbackAmount: twin.amount,
                }),
            });
            await tx.expense.delete({ where: { id: twin.id } });
        }
    });

    return { message: "Salary transaction moved to recycle bin" };
};

export const SalaryTransactionService = {
    getAllSalaryTransactions,
    createSalaryTransaction,
    updateSalaryTransaction,
    deleteSalaryTransaction,
};
