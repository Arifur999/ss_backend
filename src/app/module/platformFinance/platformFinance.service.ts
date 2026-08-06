import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import {
    ICreatePlatformExpensePayload,
    ICreatePlatformWithdrawalPayload,
    IUpdatePlatformExpensePayload,
    IUpdatePlatformWithdrawalPayload,
} from "./platformFinance.validation.js";

export type DateRange = { from?: string; to?: string };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Longest series the chart will draw. "All time" with years of history would
// otherwise produce a bar chart nobody can read.
const MAX_SERIES_MONTHS = 24;

const startOfDay = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

// Exclusive upper bound: the day after `to`, so a whole end day is included
// whether the column is a DATE or a TIMESTAMP.
const dayAfter = (value: string) => {
    const date = startOfDay(value);
    if (!date) return undefined;
    date.setDate(date.getDate() + 1);
    return date;
};

const whereForRange = (range: DateRange) => {
    const gte = range.from ? startOfDay(range.from) : undefined;
    const lt = range.to ? dayAfter(range.to) : undefined;
    if (!gte && !lt) return {};
    return { date: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } };
};

const toNumber = (value: unknown) => Number(value ?? 0);

// ---------------------------------------------------------------- expenses

const getExpenses = async (range: DateRange) => {
    return prisma.platformExpense.findMany({
        where: whereForRange(range),
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createExpense = async (payload: ICreatePlatformExpensePayload, user: IRequestUser) => {
    return prisma.platformExpense.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            created_by: user.userId,
        },
    });
};

const updateExpense = async (id: string, payload: IUpdatePlatformExpensePayload) => {
    const existing = await prisma.platformExpense.findUnique({ where: { id } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Expense not found");

    return prisma.platformExpense.update({
        where: { id },
        data: { ...payload, date: payload.date ? new Date(payload.date) : undefined },
    });
};

const deleteExpense = async (id: string) => {
    const existing = await prisma.platformExpense.findUnique({ where: { id } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Expense not found");

    await prisma.platformExpense.delete({ where: { id } });
    return { id };
};

// ------------------------------------------------------------- withdrawals

const getWithdrawals = async (range: DateRange) => {
    return prisma.platformWithdrawal.findMany({
        where: whereForRange(range),
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createWithdrawal = async (payload: ICreatePlatformWithdrawalPayload, user: IRequestUser) => {
    return prisma.platformWithdrawal.create({
        data: {
            ...payload,
            date: new Date(payload.date),
            created_by: user.userId,
        },
    });
};

const updateWithdrawal = async (id: string, payload: IUpdatePlatformWithdrawalPayload) => {
    const existing = await prisma.platformWithdrawal.findUnique({ where: { id } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Withdrawal not found");

    return prisma.platformWithdrawal.update({
        where: { id },
        data: { ...payload, date: payload.date ? new Date(payload.date) : undefined },
    });
};

const deleteWithdrawal = async (id: string) => {
    const existing = await prisma.platformWithdrawal.findUnique({ where: { id } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Withdrawal not found");

    await prisma.platformWithdrawal.delete({ where: { id } });
    return { id };
};

// ----------------------------------------------------------------- summary

// The months the chart should cover. With no filter that is the last 12
// months; with one it is the months the filter actually spans, so the chart
// moves with the cards instead of ignoring them.
const seriesBounds = (range: DateRange) => {
    const end = range.to ? dayAfter(range.to) : new Date();
    const endMonth = new Date((end ?? new Date()).getFullYear(), (end ?? new Date()).getMonth(), 1);

    let startMonth: Date;
    if (range.from) {
        const from = startOfDay(range.from) ?? new Date();
        startMonth = new Date(from.getFullYear(), from.getMonth(), 1);
    } else {
        startMonth = new Date(endMonth);
        startMonth.setMonth(startMonth.getMonth() - 11);
    }

    let months = (endMonth.getFullYear() - startMonth.getFullYear()) * 12 + (endMonth.getMonth() - startMonth.getMonth()) + 1;
    if (months < 1) months = 1;
    if (months > MAX_SERIES_MONTHS) {
        months = MAX_SERIES_MONTHS;
        startMonth = new Date(endMonth);
        startMonth.setMonth(startMonth.getMonth() - (MAX_SERIES_MONTHS - 1));
    }

    const exclusiveEnd = new Date(endMonth);
    exclusiveEnd.setMonth(exclusiveEnd.getMonth() + 1);

    return { startMonth, exclusiveEnd, months };
};

const getSummary = async (range: DateRange) => {
    const where = whereForRange(range);
    const { startMonth, exclusiveEnd, months } = seriesBounds(range);

    const [byPlan, sms, expenses, withdrawals, subscriptionSeries, smsSeries, expenseSeries] = await Promise.all([
        // Only money actually received counts as income - a pending payment is
        // not revenue until it clears.
        prisma.subscriptionPayment.groupBy({
            by: ["plan_type"],
            where: { status: "paid", ...where },
            _sum: { amount: true },
        }),
        prisma.smsPurchase.aggregate({
            where: { status: "paid", ...where },
            _sum: { amount: true },
        }),
        prisma.platformExpense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
        prisma.platformWithdrawal.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM subscription_payments
            WHERE status = 'paid' AND date >= ${startMonth} AND date < ${exclusiveEnd}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM sms_purchases
            WHERE status = 'paid' AND date >= ${startMonth} AND date < ${exclusiveEnd}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM platform_expenses
            WHERE date >= ${startMonth} AND date < ${exclusiveEnd}
            GROUP BY 1
            ORDER BY 1
        `,
    ]);

    const planTotal = (plan: string) =>
        toNumber(byPlan.find((row) => row.plan_type === plan)?._sum.amount);

    const subscriptionMonthly = planTotal("monthly");
    const subscriptionYearly = planTotal("yearly");
    const smsIncome = toNumber(sms._sum.amount);
    const totalIncome = subscriptionMonthly + subscriptionYearly + smsIncome;
    const totalExpense = toNumber(expenses._sum.amount);
    const totalWithdrawn = toNumber(withdrawals._sum.amount);
    const profit = totalIncome - totalExpense;

    const subscriptionByMonth = new Map(subscriptionSeries.map((row) => [row.month, Number(row.total)]));
    const smsByMonth = new Map(smsSeries.map((row) => [row.month, Number(row.total)]));
    const expenseByMonth = new Map(expenseSeries.map((row) => [row.month, Number(row.total)]));

    // Every month gets a bar, including the empty ones, so a quiet month reads
    // as zero rather than silently collapsing the axis.
    const monthly = [];
    const cursor = new Date(startMonth);
    for (let index = 0; index < months; index += 1) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const subscription = subscriptionByMonth.get(key) ?? 0;
        const smsAmount = smsByMonth.get(key) ?? 0;
        const expense = expenseByMonth.get(key) ?? 0;
        monthly.push({
            month: MONTH_NAMES[cursor.getMonth()],
            income: subscription + smsAmount,
            subscription,
            sms: smsAmount,
            expense,
            profit: subscription + smsAmount - expense,
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
        subscription_monthly: subscriptionMonthly,
        subscription_yearly: subscriptionYearly,
        subscription_income: subscriptionMonthly + subscriptionYearly,
        sms_income: smsIncome,
        total_income: totalIncome,
        total_expense: totalExpense,
        expense_count: expenses._count._all,
        profit,
        total_withdrawn: totalWithdrawn,
        withdrawal_count: withdrawals._count._all,
        // What is left after paying the bills and taking money out - the number
        // that answers "how much can I still take".
        available: profit - totalWithdrawn,
        monthly,
    };
};

export const PlatformFinanceService = {
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getWithdrawals,
    createWithdrawal,
    updateWithdrawal,
    deleteWithdrawal,
    getSummary,
};
