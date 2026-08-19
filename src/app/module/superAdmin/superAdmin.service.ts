import bcrypt from "bcryptjs";
import status from "http-status";
import { PlanStatus, Role, SubscriptionStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { invalidateAuthCaches, invalidateOwnerAccess } from "../../utils/authCache.js";
import { sendTemplatedEmail } from "../../utils/email.js";
import { buildPlanGiftCardHtml, planGiftCardSubject } from "../../utils/giftCard.js";
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
// (stays exactly as-is) and their business settings (name/logo).
//
// Gated on the SUPER ADMIN's own password - the person performing the action.
// It used to compare against the OWNER's password, which made this endpoint a
// password oracle: a super admin could put any guess in the confirmation box and
// the response told them whether it was that customer's password, with no
// attempt cap. It was also unusable as designed, since a super admin does not
// know the owner's password.
const resetOwnerData = async (ownerId: string, password: string, admin: IRequestUser) => {
    const owner = await prisma.user.findFirst({
        where: { id: ownerId, role: Role.owner },
    });

    if (!owner) {
        throw new AppError(status.NOT_FOUND, "Owner not found");
    }

    const actor = await prisma.user.findUnique({ where: { id: admin.userId } });
    if (!actor) {
        throw new AppError(status.UNAUTHORIZED, "Session no longer valid - please sign in again.");
    }

    const isPasswordValid = await bcrypt.compare(password, actor.password);
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

            // Bundled SMS credits, granted on EVERY approved payment - a
            // monthly plan tops the wallet up 100 each month it is renewed, a
            // yearly one 500 each year. It used to fire only on the owner's
            // first payment of a plan, which meant the plan cards promised
            // free SMS the second month never delivered.
            //
            // The guard above (payload.status === "paid" && payment.status !==
            // "paid") is what stops a re-save of an already-paid payment from
            // crediting the wallet twice - the grant follows the approval, not
            // the row.
            const credits = planSmsCredits(nextPayment.plan_type);
            if (credits > 0) {
                await tx.smsWallet.upsert({
                    where: { owner_id: payment.owner_id },
                    create: { owner_id: payment.owner_id, balance: credits },
                    update: { balance: { increment: credits } },
                });
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

    // When this approval just activated a paid plan, email the owner their
    // welcome card - the plan, the dates, the receipt and the support line.
    // Fire-and-forget - a slow mail provider must never block the approval
    // response, and the support number is read alongside it because a card
    // without a number to call is the one thing it must not be.
    if (payload.status === "paid" && payment.status !== "paid") {
        const [owner, settings] = await Promise.all([
            prisma.user.findUnique({
                where: { id: payment.owner_id },
                include: { subscription: true },
            }),
            prisma.platformSetting.findFirst().catch(() => null),
        ]);
        if (owner?.email) {
            void sendTemplatedEmail(
                owner.email,
                planGiftCardSubject(updated.plan_type),
                buildPlanGiftCardHtml({
                    ownerName: owner.full_name || "",
                    businessName: owner.subscription?.business_name || owner.full_name || "",
                    planType: updated.plan_type,
                    amount: Number(updated.amount),
                    invoiceNo: updated.invoice_no,
                    trxId: updated.trx_id,
                    senderNumber: updated.sender_number,
                    purchaseDate: updated.date,
                    expiryDate: owner.subscription?.expiry_date,
                    supportNumber: settings?.support_number,
                }),
            );
        }
    }

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
/**
 * The platform's OWN report - this business, not the businesses using it.
 *
 * It used to sum the sales table with no owner filter, which made the headline
 * figure every customer's trading added together: Tk 16.9 crore of other
 * people's furniture, on a page meant to say how the software is doing. That
 * number belongs to them, not here.
 *
 * What replaced it is the operator's own trade: money that actually reached us,
 * who is paying, who is trying it, and what is waiting to be approved. Revenue
 * counts only `paid` rows - a pending payment is not income until it clears,
 * which is the same rule the Finance page applies.
 */
const getPlatformReports = async () => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    const now = new Date();

    const [
        subscriptionPaid,
        smsPaid,
        pending,
        byPlan,
        totalOwners,
        subscriptions,
        subscriptionSeries,
        smsSeries,
        ownerSeries,
    ] = await Promise.all([
        prisma.subscriptionPayment.aggregate({
            where: { status: "paid" },
            _sum: { amount: true },
            _count: { _all: true },
        }),
        prisma.smsPurchase.aggregate({
            where: { status: "paid" },
            _sum: { amount: true },
            _count: { _all: true },
        }),
        // Money already sent that nobody has approved yet. It is not revenue,
        // but it is the queue the operator has to work through.
        prisma.subscriptionPayment.aggregate({
            where: { status: "pending" },
            _sum: { amount: true },
            _count: { _all: true },
        }),
        prisma.subscriptionPayment.groupBy({
            by: ["plan_type"],
            where: { status: "paid" },
            _sum: { amount: true },
            _count: { _all: true },
        }),
        prisma.user.count({ where: { role: Role.owner } }),
        prisma.ownerSubscription.findMany({
            select: { status: true, plan_type: true, expiry_date: true },
        }),
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM subscription_payments
            WHERE status = 'paid' AND date >= ${twelveMonthsAgo}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM sms_purchases
            WHERE status = 'paid' AND date >= ${twelveMonthsAgo}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                   COUNT(*)::float AS total
            FROM users
            WHERE role = 'owner' AND created_at >= ${twelveMonthsAgo}
            GROUP BY 1
            ORDER BY 1
        `,
    ]);

    // Active means the same thing here as on the Active Customers page: the
    // subscription says active AND the expiry has not passed. A row left at
    // "active" with a date in the past is expired, whatever it says.
    const nowMs = now.getTime();
    let activeSubscriptions = 0;
    let onTrial = 0;
    let expired = 0;
    let monthlyPlans = 0;
    let yearlyPlans = 0;

    subscriptions.forEach((sub) => {
        const live =
            sub.status === SubscriptionStatus.active &&
            sub.expiry_date != null &&
            sub.expiry_date.getTime() > nowMs;

        if (!live) {
            expired += 1;
            return;
        }
        if (sub.plan_type === "free_trial") {
            onTrial += 1;
            return;
        }
        activeSubscriptions += 1;
        if (sub.plan_type === "monthly") monthlyPlans += 1;
        if (sub.plan_type === "yearly") yearlyPlans += 1;
    });

    const planRow = (plan: string) => byPlan.find((row) => row.plan_type === plan);
    const subscriptionRevenue = Number(subscriptionPaid._sum.amount ?? 0);
    const smsRevenue = Number(smsPaid._sum.amount ?? 0);

    const subscriptionByMonth = new Map(subscriptionSeries.map((row) => [row.month, Number(row.total)]));
    const smsByMonth = new Map(smsSeries.map((row) => [row.month, Number(row.total)]));
    const ownersByMonth = new Map(ownerSeries.map((row) => [row.month, Number(row.total)]));

    // A continuous 12-month series, empty months included, so a quiet month
    // reads as zero rather than collapsing the axis onto the busy ones.
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthly = [];
    const cursor = new Date(twelveMonthsAgo);
    for (let index = 0; index < 12; index += 1) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const subscription = subscriptionByMonth.get(key) ?? 0;
        const sms = smsByMonth.get(key) ?? 0;
        monthly.push({
            month: monthNames[cursor.getMonth()],
            subscription,
            sms,
            revenue: subscription + sms,
            new_owners: ownersByMonth.get(key) ?? 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
        subscription_revenue: subscriptionRevenue,
        sms_revenue: smsRevenue,
        total_revenue: subscriptionRevenue + smsRevenue,
        paid_payment_count: subscriptionPaid._count._all,
        sms_purchase_count: smsPaid._count._all,
        pending_amount: Number(pending._sum.amount ?? 0),
        pending_count: pending._count._all,
        total_owners: totalOwners,
        active_subscriptions: activeSubscriptions,
        on_trial: onTrial,
        expired,
        monthly_plans: monthlyPlans,
        yearly_plans: yearlyPlans,
        monthly_revenue: Number(planRow("monthly")?._sum.amount ?? 0),
        yearly_revenue: Number(planRow("yearly")?._sum.amount ?? 0),
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
