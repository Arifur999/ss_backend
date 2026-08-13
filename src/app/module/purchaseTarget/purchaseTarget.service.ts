import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { assertOwnedRecord } from "../../shared/assertOwnership.js";
import { ICreatePurchaseTargetPayload, IUpdatePurchaseTargetPayload } from "./purchaseTarget.validation.js";

// The supplier comes back alongside so the page can show the company name
// without a second lookup, the same way products carry theirs.
const withSupplier = { supplier: { select: { id: true, name: true, company_name: true } } };

const assertSupplierIsOurs = async (supplierId: string, user: IRequestUser) => {
    await assertOwnedRecord(
        () => prisma.supplier.findFirst({ where: { id: supplierId, owner_id: user.ownerId }, select: { id: true } }),
        "Supplier",
    );
};

const getAllTargets = async (user: IRequestUser) => {
    return prisma.purchaseTarget.findMany({
        where: { owner_id: user.ownerId },
        include: withSupplier,
        orderBy: [{ start_year: "desc" }, { start_month: "desc" }],
    });
};

const createTarget = async (payload: ICreatePurchaseTargetPayload, user: IRequestUser) => {
    await assertSupplierIsOurs(payload.supplier_id, user);
    return prisma.purchaseTarget.create({
        data: { ...payload, owner_id: user.ownerId },
        include: withSupplier,
    });
};

const updateTarget = async (id: string, payload: IUpdatePurchaseTargetPayload, user: IRequestUser) => {
    const existing = await prisma.purchaseTarget.findFirst({ where: { id, owner_id: user.ownerId } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Purchase target not found");

    if (payload.supplier_id) await assertSupplierIsOurs(payload.supplier_id, user);

    // The range can be edited one field at a time, so it is checked against
    // what the row will actually hold rather than against the payload alone -
    // moving the start past an unchanged end would otherwise slip through.
    const next = {
        start_year: payload.start_year ?? existing.start_year,
        start_month: payload.start_month ?? existing.start_month,
        end_year: payload.end_year ?? existing.end_year,
        end_month: payload.end_month ?? existing.end_month,
    };
    if (next.end_year * 12 + next.end_month < next.start_year * 12 + next.start_month) {
        throw new AppError(status.BAD_REQUEST, "The end month cannot come before the start month");
    }

    return prisma.purchaseTarget.update({ where: { id }, data: payload, include: withSupplier });
};

const deleteTarget = async (id: string, user: IRequestUser) => {
    const existing = await prisma.purchaseTarget.findFirst({ where: { id, owner_id: user.ownerId } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Purchase target not found");

    await prisma.purchaseTarget.delete({ where: { id } });
    return { message: "Purchase target deleted successfully" };
};

export const PurchaseTargetService = {
    getAllTargets,
    createTarget,
    updateTarget,
    deleteTarget,
};
