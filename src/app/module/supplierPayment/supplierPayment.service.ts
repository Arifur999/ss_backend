import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { ICreateSupplierPaymentPayload, IUpdateSupplierPaymentPayload } from "./supplierPayment.validation.js";

const getAllPayments = async (user: IRequestUser) => {
    return prisma.supplierPayment.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createPayment = async (payload: ICreateSupplierPaymentPayload, user: IRequestUser) => {
    return prisma.supplierPayment.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
    });
};

const updatePayment = async (id: string, payload: IUpdateSupplierPaymentPayload, user: IRequestUser) => {
    const existing = await prisma.supplierPayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Supplier payment not found");
    }

    return prisma.supplierPayment.update({
        where: { id },
        data: {
            ...payload,
            date: payload.date ? new Date(payload.date) : undefined,
        },
    });
};

const deletePayment = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.supplierPayment.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Supplier payment not found");
    }

    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "supplier_payments",
                row: existing,
                meta: recycleMeta,
                fallbackType: "purchase",
                fallbackTitle: existing.supplier_name,
                fallbackSubtitle: existing.purchase_si_no,
                fallbackAmount: existing.amount,
            }),
        });
        await tx.supplierPayment.delete({ where: { id } });
    });

    return { message: "Supplier payment moved to recycle bin" };
};

export const SupplierPaymentService = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
