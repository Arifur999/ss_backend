import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateCustomerPaymentPayload, IUpdateCustomerPaymentPayload } from "./customerPayment.validation.js";

const getAllPayments = async (user: IRequestUser) => {
    return prisma.customerPayment.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

// Due collection: if linked to a sale, also settle the sale's paid/due totals.
const createPayment = async (payload: ICreateCustomerPaymentPayload, user: IRequestUser) => {
    return prisma.$transaction(async (tx) => {
        const payment = await tx.customerPayment.create({
            data: {
                ...payload,
                date: new Date(payload.date),
                owner_id: user.ownerId,
                created_by: user.userId,
            },
        });

        if (payload.sale_id) {
            const sale = await tx.sale.findFirst({
                where: { id: payload.sale_id, owner_id: user.ownerId },
            });
            if (sale) {
                await tx.sale.update({
                    where: { id: sale.id },
                    data: {
                        paid_amount: { increment: payload.amount },
                        due_amount: { decrement: payload.amount },
                    },
                });
            }
        }

        return payment;
    });
};

const updatePayment = async (id: string, payload: IUpdateCustomerPaymentPayload, user: IRequestUser) => {
    const existing = await prisma.customerPayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Customer payment not found");
    }

    return prisma.$transaction(async (tx) => {
        const updated = await tx.customerPayment.update({
            where: { id },
            data: {
                ...payload,
                date: payload.date ? new Date(payload.date) : undefined,
            },
        });

        // Keep the linked sale's totals in sync when the amount changes.
        if (payload.amount !== undefined && existing.sale_id) {
            const delta = payload.amount - Number(existing.amount);
            if (delta !== 0) {
                await tx.sale.updateMany({
                    where: { id: existing.sale_id, owner_id: user.ownerId },
                    data: {
                        paid_amount: { increment: delta },
                        due_amount: { decrement: delta },
                    },
                });
            }
        }

        return updated;
    });
};

const deletePayment = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.customerPayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Customer payment not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "customer_payments",
                row: existing,
                meta: recycleMeta,
                fallbackType: "due",
                fallbackTitle: existing.customer_name,
                fallbackSubtitle: existing.invoice_no,
                fallbackAmount: existing.amount,
            }),
        });

        if (existing.sale_id) {
            await tx.sale.updateMany({
                where: { id: existing.sale_id, owner_id: user.ownerId },
                data: {
                    paid_amount: { decrement: existing.amount },
                    due_amount: { increment: existing.amount },
                },
            });
        }

        await tx.customerPayment.delete({ where: { id } });
    });

    return { message: "Customer payment moved to recycle bin" };
};

export const CustomerPaymentService = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
