import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateSupplierPayload, IUpdateSupplierPayload } from "./supplier.validation.js";

const getAllSuppliers = async (user: IRequestUser) => {
    return prisma.supplier.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: { created_at: "desc" },
    });
};

const createSupplier = async (payload: ICreateSupplierPayload, user: IRequestUser) => {
    return prisma.supplier.create({
        data: { ...payload, owner_id: user.ownerId },
    });
};

const updateSupplier = async (id: string, payload: IUpdateSupplierPayload, user: IRequestUser) => {
    const existing = await prisma.supplier.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Supplier not found");
    }

    return prisma.supplier.update({
        where: { id },
        data: payload,
    });
};

const deleteSupplier = async (id: string, user: IRequestUser) => {
    const existing = await prisma.supplier.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Supplier not found");
    }

    const [purchaseCount, paymentCount] = await Promise.all([
        prisma.purchase.count({ where: { supplier_id: id, owner_id: user.ownerId } }),
        prisma.supplierPayment.count({ where: { supplier_id: id, owner_id: user.ownerId } }),
    ]);

    if (purchaseCount > 0 || paymentCount > 0) {
        throw new AppError(
            status.CONFLICT,
            "This supplier has purchases or payments. Delete those records first."
        );
    }

    await prisma.supplier.delete({ where: { id } });

    return { message: "Supplier deleted successfully" };
};

export const SupplierService = {
    getAllSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
};
