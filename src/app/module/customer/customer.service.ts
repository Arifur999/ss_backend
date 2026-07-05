import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateCustomerPayload, IUpdateCustomerPayload } from "./customer.validation.js";

const getAllCustomers = async (user: IRequestUser) => {
    return prisma.customer.findMany({
        where: { owner_id: user.ownerId, deleted_at: null },
        orderBy: { created_at: "desc" },
    });
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
const deleteCustomer = async (id: string, user: IRequestUser) => {
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

    await prisma.customer.delete({ where: { id } });

    return { message: "Customer deleted successfully" };
};

export const CustomerService = {
    getAllCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
