import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { buildRecycleItemData, IRecycleMeta } from "../../shared/recycleSnapshot.js";
import { escapeLikeTerm, pageSlice, type ListOptions } from "../../shared/listQuery.js";
import { ICreateCustomerPayload, IUpdateCustomerPayload } from "./customer.validation.js";

// Paging and search are opt-in: without a `limit` this returns everything,
// exactly as before, so the sale form and anything else reading the full list
// is untouched. The search matches the browser's - a literal, case-insensitive
// contains over name and phone, wildcards escaped.
const getAllCustomers = async (user: IRequestUser, options: ListOptions = {}) => {
    const where: Prisma.CustomerWhereInput = {
        owner_id: user.ownerId,
        deleted_at: null,
        ...(options.search
            ? {
                OR: [
                    { name: { contains: escapeLikeTerm(options.search), mode: "insensitive" } },
                    { phone: { contains: escapeLikeTerm(options.search), mode: "insensitive" } },
                ],
            }
            : {}),
    };

    const slice = pageSlice(options);

    if (!slice) {
        const rows = await prisma.customer.findMany({ where, orderBy: { created_at: "desc" } });
        return { rows, total: rows.length };
    }

    const [rows, total] = await Promise.all([
        prisma.customer.findMany({ where, orderBy: { created_at: "desc" }, skip: slice.skip, take: slice.take }),
        prisma.customer.count({ where }),
    ]);
    return { rows, total };
};

const createCustomer = async (payload: ICreateCustomerPayload, user: IRequestUser) => {
    return prisma.customer.create({
        data: { ...payload, owner_id: user.ownerId },
    });
};

const updateCustomer = async (id: string, payload: IUpdateCustomerPayload, user: IRequestUser) => {
    const existing = await prisma.customer.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Customer not found");
    }

    return prisma.customer.update({
        where: { id },
        data: payload,
    });
};

// Mirrors the old guard_customer_deletes trigger: block deleting a customer
// that still has sales or payments.
const deleteCustomer = async (id: string, user: IRequestUser, recycleMeta?: IRecycleMeta) => {
    const existing = await prisma.customer.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Customer not found");
    }

    const [salesCount, paymentCount] = await Promise.all([
        prisma.sale.count({ where: { customer_id: id, owner_id: user.ownerId, deleted_at: null } }),
        prisma.customerPayment.count({ where: { customer_id: id, owner_id: user.ownerId, deleted_at: null } }),
    ]);

    if (salesCount > 0 || paymentCount > 0) {
        throw new AppError(
            status.CONFLICT,
            "This customer has sales or payment records. Delete those records first."
        );
    }

    // Snapshot before the row goes, so the Recycle Bin can actually return it.
    // The frontend already offered "deleted - restorable" for these, and the
    // recycle-bin page already lists a tab for them, but no snapshot was ever
    // written: the record was gone for good and the bin stayed empty.
    await prisma.$transaction(async (tx) => {
        await tx.recycleBinItem.create({
            data: buildRecycleItemData({
                user,
                tableName: "customers",
                row: existing,
                meta: recycleMeta,
                fallbackType: "customers",
                fallbackTitle: String(existing.name ?? ""),
                fallbackSubtitle: existing.phone ?? "",
                fallbackAmount: existing.opening_due,
            }),
        });

        await tx.customer.delete({ where: { id } });
    });

    return { message: "Customer deleted successfully" };
};

export const CustomerService = {
    getAllCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
