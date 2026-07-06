import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateSalePaymentPayload, IUpdateSalePaymentPayload } from "./salePayment.validation.js";

const getAllPayments = async (user: IRequestUser, saleId?: string) => {
    return prisma.salePayment.findMany({
        where: {
            owner_id: user.ownerId,
            ...(saleId ? { sale_id: saleId } : {}),
        },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createPayment = async (payload: ICreateSalePaymentPayload, user: IRequestUser) => {
    const sale = await prisma.sale.findFirst({
        where: { id: payload.sale_id, owner_id: user.ownerId },
    });

    if (!sale) {
        throw new AppError(status.NOT_FOUND, "Sale not found");
    }

    return prisma.salePayment.create({
        data: {
            ...payload,
            invoice_no: payload.invoice_no ?? sale.invoice_no,
            customer_id: payload.customer_id ?? sale.customer_id,
            customer_name: payload.customer_name ?? sale.customer_name,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updatePayment = async (id: string, payload: IUpdateSalePaymentPayload, user: IRequestUser) => {
    const existing = await prisma.salePayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Sale payment not found");
    }

    return prisma.salePayment.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deletePayment = async (id: string, user: IRequestUser) => {
    const existing = await prisma.salePayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Sale payment not found");
    }

    await prisma.salePayment.delete({ where: { id } });

    return { message: "Sale payment deleted successfully" };
};

export const SalePaymentService = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
