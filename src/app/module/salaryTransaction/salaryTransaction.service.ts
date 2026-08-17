import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { assertOwnedReferences } from "../../shared/assertOwnership.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
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

const createSalaryTransaction = async (payload: ICreateSalaryTransactionPayload, user: IRequestUser) => {
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

    return prisma.salaryTransaction.create({
        data: {
            ...payload,
            employee_name: payload.employee_name ?? employee.name,
            date: new Date(payload.date),
            period_from: payload.period_from ? new Date(payload.period_from) : null,
            period_to: payload.period_to ? new Date(payload.period_to) : null,
            owner_id: user.ownerId,
            created_by: user.userId,
        },
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

const deleteSalaryTransaction = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.salaryTransaction.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Salary transaction not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "salary_transactions",
                row: existing,
                meta: recycleMeta,
                fallbackType: "employees",
                fallbackTitle: existing.employee_name,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.salaryTransaction.delete({ where: { id } });
    });

    return { message: "Salary transaction moved to recycle bin" };
};

export const SalaryTransactionService = {
    getAllSalaryTransactions,
    createSalaryTransaction,
    updateSalaryTransaction,
    deleteSalaryTransaction,
};
