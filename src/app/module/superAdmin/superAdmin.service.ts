import status from "http-status";
import { PlanStatus, Role, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { IUpdateOwnerSubscriptionPayload, IUpdateSubscriptionPaymentPayload } from "./superAdmin.validation.js";

// Owner list with profile + subscription, shaped like the old superAdminLive loader.
const getAllOwners = async () => {
    const owners = await prisma.user.findMany({
        where: { role: Role.owner },
        include: { subscription: true },
        orderBy: { created_at: "desc" },
    });

    return owners.map((owner) => ({
        id: owner.id,
        email: owner.email,
        full_name: owner.full_name,
        phone: owner.phone,
        is_active: owner.is_active,
        last_active: owner.last_active,
        created_at: owner.created_at,
        subscription: owner.subscription,
    }));
};

const updateOwnerSubscription = async (
    ownerId: string,
    payload: IUpdateOwnerSubscriptionPayload,
    admin: IRequestUser
) => {
    const existing = await prisma.ownerSubscription.findUnique({
        where: { owner_id: ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Owner subscription not found");
    }

    const updated = await prisma.ownerSubscription.update({
        where: { owner_id: ownerId },
        data: {
            ...payload,
            start_date: payload.start_date ? new Date(payload.start_date) : undefined,
            expiry_date: payload.expiry_date ? new Date(payload.expiry_date) : undefined,
            active_until:
                payload.active_until === null
                    ? null
                    : payload.active_until
                        ? new Date(payload.active_until)
                        : undefined,
        },
    });

    await logAdminActivity({
        ownerId,
        actorEmail: admin.email,
        action: "subscription_updated",
        detail: `Subscription updated: ${JSON.stringify(payload)}`,
    });

    return updated;
};

// Mirrors the old grant_owner_trial_extension RPC: exactly 7 days from the
// current expiry, or from now when already expired.
const grantTrialExtension = async (ownerId: string, admin: IRequestUser) => {
    const existing = await prisma.ownerSubscription.findUnique({
        where: { owner_id: ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Owner subscription not found");
    }

    const baseTime = new Date(
        Math.max(existing.expiry_date?.getTime() ?? 0, existing.active_until?.getTime() ?? 0, Date.now())
    );
    const newExpiry = new Date(baseTime);
    newExpiry.setDate(newExpiry.getDate() + 7);

    const updated = await prisma.ownerSubscription.update({
        where: { owner_id: ownerId },
        data: {
            plan_type: "free_trial",
            plan_status: PlanStatus.active,
            status: SubscriptionStatus.active,
            plan: "Trial",
            expiry_date: newExpiry,
            active_until: newExpiry,
            trial_end: newExpiry,
            blocked_reason: "",
        },
    });

    await logAdminActivity({
        ownerId,
        actorEmail: admin.email,
        action: "trial_extended",
        detail: `Trial extended by 7 days (new expiry: ${newExpiry.toISOString()})`,
    });

    return updated;
};

const deleteOwner = async (ownerId: string, admin: IRequestUser) => {
    const owner = await prisma.user.findFirst({
        where: { id: ownerId, role: Role.owner },
    });

    if (!owner) {
        throw new AppError(status.NOT_FOUND, "Owner not found");
    }

    // Workspace rows carry owner_id (plain column). Team users + subscription
    // cascade via FK; workspace data is removed table-by-table.
    await prisma.$transaction([
        prisma.saleItemCostLayer.deleteMany({ where: { owner_id: ownerId } }),
        prisma.inventoryBatch.deleteMany({ where: { owner_id: ownerId } }),
        prisma.inventoryHistory.deleteMany({ where: { owner_id: ownerId } }),
        prisma.inventory.deleteMany({ where: { owner_id: ownerId } }),
        prisma.saleDelivery.deleteMany({ where: { owner_id: ownerId } }),
        prisma.salePayment.deleteMany({ where: { owner_id: ownerId } }),
        prisma.customerPayment.deleteMany({ where: { owner_id: ownerId } }),
        prisma.saleItem.deleteMany({ where: { owner_id: ownerId } }),
        prisma.sale.deleteMany({ where: { owner_id: ownerId } }),
        prisma.purchaseReceive.deleteMany({ where: { owner_id: ownerId } }),
        prisma.supplierPayment.deleteMany({ where: { owner_id: ownerId } }),
        prisma.purchaseItem.deleteMany({ where: { owner_id: ownerId } }),
        prisma.purchase.deleteMany({ where: { owner_id: ownerId } }),
        prisma.otherIncome.deleteMany({ where: { owner_id: ownerId } }),
        prisma.salaryTransaction.deleteMany({ where: { owner_id: ownerId } }),
        prisma.attendance.deleteMany({ where: { owner_id: ownerId } }),
        prisma.employee.deleteMany({ where: { owner_id: ownerId } }),
        prisma.expense.deleteMany({ where: { owner_id: ownerId } }),
        prisma.expenseCategory.deleteMany({ where: { owner_id: ownerId } }),
        prisma.loan.deleteMany({ where: { owner_id: ownerId } }),
        prisma.loanLender.deleteMany({ where: { owner_id: ownerId } }),
        prisma.accountTransfer.deleteMany({ where: { owner_id: ownerId } }),
        prisma.investment.deleteMany({ where: { owner_id: ownerId } }),
        prisma.profitWithdrawal.deleteMany({ where: { owner_id: ownerId } }),
        prisma.product.deleteMany({ where: { owner_id: ownerId } }),
        prisma.customer.deleteMany({ where: { owner_id: ownerId } }),
        prisma.supplier.deleteMany({ where: { owner_id: ownerId } }),
        prisma.account.deleteMany({ where: { owner_id: ownerId } }),
        prisma.shareholder.deleteMany({ where: { owner_id: ownerId } }),
        prisma.monthlyTarget.deleteMany({ where: { owner_id: ownerId } }),
        prisma.businessSettings.deleteMany({ where: { owner_id: ownerId } }),
        prisma.recycleBinItem.deleteMany({ where: { owner_id: ownerId } }),
        // Deleting the user cascades to team members + subscription + payments.
        prisma.user.delete({ where: { id: ownerId } }),
    ]);

    await logAdminActivity({
        ownerId,
        actorEmail: admin.email,
        action: "owner_deleted",
        detail: `Owner ${owner.email} and their workspace deleted`,
    });

    return { message: "Owner deleted successfully" };
};

const getAllPayments = async () => {
    return prisma.subscriptionPayment.findMany({
        include: {
            owner: {
                select: { id: true, email: true, full_name: true, subscription: { select: { business_name: true } } },
            },
        },
        orderBy: { date: "desc" },
    });
};

const updatePayment = async (
    paymentId: string,
    payload: IUpdateSubscriptionPaymentPayload,
    admin: IRequestUser
) => {
    const payment = await prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
    });

    if (!payment) {
        throw new AppError(status.NOT_FOUND, "Payment not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
        const nextPayment = await tx.subscriptionPayment.update({
            where: { id: paymentId },
            data: payload,
        });

        // Confirming a payment activates the owner's chosen plan.
        if (payload.status === "paid" && payment.status !== "paid") {
            const now = new Date();
            const expiry = new Date(now);
            if (nextPayment.plan_type === "yearly") {
                expiry.setMonth(expiry.getMonth() + 12);
            } else {
                expiry.setMonth(expiry.getMonth() + 1);
            }

            await tx.ownerSubscription.update({
                where: { owner_id: payment.owner_id },
                data: {
                    status: SubscriptionStatus.active,
                    plan: nextPayment.plan_type === "yearly" ? "Enterprise" : "Starter",
                    plan_type: nextPayment.plan_type,
                    plan_status: PlanStatus.active,
                    start_date: now,
                    expiry_date: expiry,
                    active_until: expiry,
                    blocked_reason: "",
                },
            });
        }

        return nextPayment;
    });

    await logAdminActivity({
        ownerId: payment.owner_id,
        actorEmail: admin.email,
        action: "payment_updated",
        detail: `Payment ${payment.invoice_no} marked as ${payload.status ?? "updated"}`,
    });

    return updated;
};

const getActivities = async (limit = 100) => {
    return prisma.adminActivity.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
    });
};

const getDashboardStats = async () => {
    const [owners, subscriptions, payments] = await Promise.all([
        prisma.user.count({ where: { role: Role.owner } }),
        prisma.ownerSubscription.groupBy({
            by: ["status"],
            _count: { _all: true },
        }),
        prisma.subscriptionPayment.aggregate({
            where: { status: "paid" },
            _sum: { amount: true },
            _count: { _all: true },
        }),
    ]);

    const statusCounts: Record<string, number> = {};
    subscriptions.forEach((row) => {
        statusCounts[row.status] = row._count._all;
    });

    return {
        total_owners: owners,
        status_counts: statusCounts,
        total_paid_amount: payments._sum.amount ?? 0,
        total_paid_count: payments._count._all,
    };
};

// Platform-wide report: total marketplace sales + subscription revenue,
// with a 12-month trend for the Reports page chart.
const getPlatformReports = async () => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [salesTotals, paidPayments, monthlySales, monthlyRevenue] = await Promise.all([
        prisma.sale.aggregate({
            where: { deleted_at: null },
            _sum: { net_amount: true },
            _count: { _all: true },
        }),
        prisma.subscriptionPayment.aggregate({
            where: { status: "paid" },
            _sum: { amount: true },
        }),
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(net_amount), 0)::float AS total
            FROM sales
            WHERE deleted_at IS NULL AND date >= ${twelveMonthsAgo}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM subscription_payments
            WHERE status = 'paid' AND date >= ${twelveMonthsAgo}
            GROUP BY 1
            ORDER BY 1
        `,
    ]);

    // Build a continuous 12-month series so the chart never has gaps.
    const salesByMonth = new Map(monthlySales.map((row) => [row.month, Number(row.total)]));
    const revenueByMonth = new Map(monthlyRevenue.map((row) => [row.month, Number(row.total)]));
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const monthly = [];
    const cursor = new Date(twelveMonthsAgo);
    for (let index = 0; index < 12; index += 1) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        monthly.push({
            month: monthNames[cursor.getMonth()],
            sales: salesByMonth.get(key) ?? 0,
            revenue: revenueByMonth.get(key) ?? 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
        total_sales: salesTotals._sum.net_amount ?? 0,
        total_orders: salesTotals._count._all,
        subscription_revenue: paidPayments._sum.amount ?? 0,
        monthly,
    };
};

export const SuperAdminService = {
    getAllOwners,
    updateOwnerSubscription,
    grantTrialExtension,
    deleteOwner,
    getAllPayments,
    updatePayment,
    getActivities,
    getDashboardStats,
    getPlatformReports,
};
