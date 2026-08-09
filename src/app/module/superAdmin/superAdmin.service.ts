import bcrypt from "bcryptjs";
import status from "http-status";
import { PlanStatus, Role, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import type { OwnerSubscription, SubscriptionPayment, User } from "../../../generated/prisma/client.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { invalidateAuthCaches, invalidateOwnerAccess } from "../../utils/authCache.js";
import { sendTemplatedEmail } from "../../utils/email.js";
import { planSmsCredits } from "../../utils/smsGrants.js";
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

    invalidateOwnerAccess(ownerId);

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

    invalidateOwnerAccess(ownerId);

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

    // The delete cascades to team members, whose ids are not listed here, so
    // the safe move is to drop both caches outright.
    invalidateAuthCaches();

    return { message: "Owner deleted successfully" };
};

// Resets an owner's workspace to a clean slate: deletes ALL operational data
// (products, sales, purchases, customers, suppliers, accounts, expenses,
// employees, loans, etc.) but keeps the user account, their subscription/plan
// (stays exactly as-is) and their business settings (name/logo). Requires the
// OWNER's own password as a confirmation gate.
const resetOwnerData = async (ownerId: string, password: string, admin: IRequestUser) => {
    const owner = await prisma.user.findFirst({
        where: { id: ownerId, role: Role.owner },
    });

    if (!owner) {
        throw new AppError(status.NOT_FOUND, "Owner not found");
    }

    const isPasswordValid = await bcrypt.compare(password, owner.password);
    if (!isPasswordValid) {
        throw new AppError(status.UNAUTHORIZED, "Incorrect password - reset cancelled.");
    }

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
        prisma.recycleBinItem.deleteMany({ where: { owner_id: ownerId } }),
    ]);

    await logAdminActivity({
        ownerId,
        actorEmail: admin.email,
        action: "owner_data_reset",
        detail: `All workspace data reset for ${owner.email} (account + plan kept)`,
    });

    return { message: "Owner data reset successfully. Their plan stays active." };
};

// Includes the owner's contact details so the payments page can show who to
// call about a pending transaction without a second lookup.
const getAllPayments = async () => {
    return prisma.subscriptionPayment.findMany({
        include: {
            owner: {
                select: {
                    id: true,
                    email: true,
                    full_name: true,
                    phone: true,
                    created_at: true,
                    subscription: {
                        select: {
                            business_name: true,
                            address: true,
                            plan_type: true,
                            plan_status: true,
                            expiry_date: true,
                        },
                    },
                },
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
            // Renewals stack: if the owner is still active, extend from their
            // current expiry; otherwise start from now.
            const currentSub = await tx.ownerSubscription.findUnique({
                where: { owner_id: payment.owner_id },
            });
            const base =
                currentSub?.expiry_date && currentSub.expiry_date.getTime() > now.getTime()
                    ? new Date(currentSub.expiry_date)
                    : new Date(now);
            const expiry = new Date(base);
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

            // Bundled SMS credits, granted only on the owner's FIRST approved
            // payment for this plan - renewals don't top the wallet up again.
            const credits = planSmsCredits(nextPayment.plan_type);
            if (credits > 0) {
                const earlierPaid = await tx.subscriptionPayment.count({
                    where: {
                        owner_id: payment.owner_id,
                        plan_type: nextPayment.plan_type,
                        status: "paid",
                        id: { not: nextPayment.id },
                    },
                });

                if (earlierPaid === 0) {
                    await tx.smsWallet.upsert({
                        where: { owner_id: payment.owner_id },
                        create: { owner_id: payment.owner_id, balance: credits },
                        update: { balance: { increment: credits } },
                    });
                }
            }
        }

        return nextPayment;
    });

    await logAdminActivity({
        ownerId: payment.owner_id,
        actorEmail: admin.email,
        action: "payment_updated",
        detail: `Payment ${payment.invoice_no} marked as ${payload.status ?? "updated"}`,
    });

    // Approving a payment activates the plan - the owner must regain access
    // immediately, not once the cached entry ages out.
    invalidateOwnerAccess(payment.owner_id);

    // When this approval just activated a paid plan, email the owner a detailed
    // invoice for their records. Fire-and-forget - a slow mail provider must
    // never block the approval response.
    if (payload.status === "paid" && payment.status !== "paid") {
        const owner = await prisma.user.findUnique({
            where: { id: payment.owner_id },
            include: { subscription: true },
        });
        if (owner?.email) {
            void sendTemplatedEmail(owner.email, `Payment invoice - ${updated.invoice_no}`, buildInvoiceHtml(owner, updated));
        }
    }

    return updated;
};

// What the caller above loads: the owner row plus its subscription, which is
// where the business name and expiry date on the invoice come from.
type OwnerWithSubscription = User & { subscription: OwnerSubscription | null };

// Renders the plan-purchase invoice email sent to an owner on approval.
const buildInvoiceHtml = (owner: OwnerWithSubscription, payment: SubscriptionPayment) => {
    const money = (n: number) => `Tk ${Number(n || 0).toLocaleString("en-US")}`;
    const day = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");
    const planLabel = payment.plan_type === "yearly" ? "Yearly plan" : "Monthly plan";
    const business = owner.subscription?.business_name || owner.full_name || "";
    const expiry = owner.subscription?.expiry_date;
    const row = (label: string, value: string, bold = false) =>
        `<tr><td style="padding:8px 0;color:#64748b;">${label}</td><td style="padding:8px 0;text-align:right;${bold ? "font-weight:600;" : ""}">${value}</td></tr>`;

    return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <div style="background:#0b0b0f;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:20px;">Payment Invoice</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">Invoice #${payment.invoice_no}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 16px;font-size:14px;">Hi ${owner.full_name || "there"}, thank you for your payment - your subscription is now active.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("Business", business, true)}
          ${row("Plan", planLabel, true)}
          ${row("Payment date", day(payment.date))}
          ${row("Method", "bKash (manual)")}
          ${row("Transaction ID", payment.trx_id || "-")}
          ${row("Paid from", payment.sender_number || "-")}
          ${row("Valid until", day(expiry), true)}
        </table>
        <div style="margin-top:16px;padding:16px;background:#f1f5f9;border-radius:10px;">
          <table style="width:100%;"><tr>
            <td style="font-weight:700;font-size:15px;">Amount paid</td>
            <td style="text-align:right;font-weight:800;font-size:22px;">${money(Number(payment.amount))}</td>
          </tr></table>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This is a system-generated invoice for your records.</p>
      </div>
    </div>`;
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

// Owners who have paid at least once (>=1 confirmed payment). Shared shape for
// the Active and Churned customer pages; `is_active` decides which list an
// owner falls into (active = subscription active AND not yet expired).
const getPaidCustomers = async () => {
    const owners = await prisma.user.findMany({
        where: {
            role: Role.owner,
            subscription_payments: { some: { status: "paid" } },
        },
        include: {
            subscription: true,
            subscription_payments: { where: { status: "paid" }, orderBy: { date: "desc" } },
        },
        orderBy: { created_at: "desc" },
    });

    const now = Date.now();
    return owners.map((owner) => {
        const sub = owner.subscription;
        const paid = owner.subscription_payments;
        const lastPaid = paid[0] ?? null;
        const expiry = sub?.expiry_date ?? null;
        const daysLeft = expiry ? Math.ceil((expiry.getTime() - now) / 86400000) : null;
        const isActive = Boolean(
            sub && sub.status === SubscriptionStatus.active && expiry && expiry.getTime() > now
        );
        return {
            id: owner.id,
            email: owner.email,
            full_name: owner.full_name,
            phone: owner.phone,
            last_active: owner.last_active,
            business_name: sub?.business_name ?? "",
            address: sub?.address ?? "",
            plan: sub?.plan ?? "",
            plan_type: sub?.plan_type ?? "",
            status: sub?.status ?? "",
            start_date: sub?.start_date ?? null,
            expiry_date: expiry,
            days_left: daysLeft,
            last_paid_amount: lastPaid ? Number(lastPaid.amount) : 0,
            last_paid_date: lastPaid?.date ?? null,
            total_paid: paid.reduce((sum, payment) => sum + Number(payment.amount), 0),
            paid_count: paid.length,
            is_active: isActive,
        };
    });
};

const getActiveCustomers = async () => (await getPaidCustomers()).filter((customer) => customer.is_active);
const getChurnedCustomers = async () => (await getPaidCustomers()).filter((customer) => !customer.is_active);

// Manual follow-up email the super admin sends to a churned/lapsed customer.
const sendFollowupEmail = async (
    ownerId: string,
    payload: { subject?: string; message?: string },
    admin: IRequestUser
) => {
    const message = (payload.message ?? "").trim();
    if (!message) {
        throw new AppError(status.BAD_REQUEST, "Message is required");
    }

    const owner = await prisma.user.findFirst({
        where: { id: ownerId, role: Role.owner },
        include: { subscription: true },
    });
    if (!owner) {
        throw new AppError(status.NOT_FOUND, "Owner not found");
    }

    const escape = (value: string) =>
        value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const subject = (payload.subject ?? "").trim() || `A quick note from ${owner.subscription?.business_name || "us"}`;
    const bodyHtml = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.6;white-space:pre-wrap;">${escape(message)}</div>`;

    const sent = await sendTemplatedEmail(owner.email, subject, bodyHtml);

    await logAdminActivity({
        ownerId,
        actorEmail: admin.email,
        action: "followup_email",
        detail: `Follow-up email ${sent ? "sent" : "attempted (email not configured)"} to ${owner.email}`,
    });

    return { sent, email: owner.email };
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
    getActiveCustomers,
    getChurnedCustomers,
    sendFollowupEmail,
    resetOwnerData,
};
