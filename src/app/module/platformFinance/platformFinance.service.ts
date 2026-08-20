import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { fillMonths, toMonthMap } from "../../shared/revenueSeries.js";
import {
    ICreatePlatformExpensePayload,
    ICreatePlatformWithdrawalPayload,
    IUpdatePlatformExpensePayload,
    IUpdatePlatformWithdrawalPayload,
} from "./platformFinance.validation.js";

export type DateRange = { from?: string; to?: string };

// MONTH_NAMES, the month keys and the gap-filling loop all come from
// shared/revenueSeries now - the super admin Reports page builds the same
// series and the two had already drifted apart.

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
// Month boundaries in UTC, matching the keys Postgres groups the money by.
// Local boundaries with UTC keys put a payment made near midnight at the turn
// of a month into the wrong bar, or outside the window entirely.
const firstOfMonthUtc = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const seriesBounds = (range: DateRange) => {
    const end = range.to ? dayAfter(range.to) : new Date();
    const endMonth = firstOfMonthUtc(end ?? new Date());

    let startMonth: Date;
    if (range.from) {
        startMonth = firstOfMonthUtc(startOfDay(range.from) ?? new Date());
    } else {
        startMonth = new Date(endMonth);
        startMonth.setUTCMonth(startMonth.getUTCMonth() - 11);
    }

    let months = (endMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12
        + (endMonth.getUTCMonth() - startMonth.getUTCMonth()) + 1;
    if (months < 1) months = 1;
    if (months > MAX_SERIES_MONTHS) {
        months = MAX_SERIES_MONTHS;
        startMonth = new Date(endMonth);
        startMonth.setUTCMonth(startMonth.getUTCMonth() - (MAX_SERIES_MONTHS - 1));
    }

    const exclusiveEnd = new Date(endMonth);
    exclusiveEnd.setUTCMonth(exclusiveEnd.getUTCMonth() + 1);

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
    // Summed over the rows rather than adding the two plans by name: plan_type
    // also permits free_trial, and a paid row carrying it belongs in the income
    // whatever it is called.
    const subscriptionIncome = byPlan.reduce((sum, row) => sum + toNumber(row._sum.amount), 0);
    const smsIncome = toNumber(sms._sum.amount);
    const totalIncome = subscriptionIncome + smsIncome;
    const totalExpense = toNumber(expenses._sum.amount);
    const totalWithdrawn = toNumber(withdrawals._sum.amount);
    const profit = totalIncome - totalExpense;

    const subscriptionByMonth = toMonthMap(subscriptionSeries);
    const smsByMonth = toMonthMap(smsSeries);
    const expenseByMonth = toMonthMap(expenseSeries);

    const monthly = fillMonths(startMonth, months, (key, month) => {
        const subscription = subscriptionByMonth.get(key) ?? 0;
        const smsAmount = smsByMonth.get(key) ?? 0;
        const expense = expenseByMonth.get(key) ?? 0;
        return {
            month,
            income: subscription + smsAmount,
            subscription,
            sms: smsAmount,
            expense,
            profit: subscription + smsAmount - expense,
        };
    });

    return {
        subscription_monthly: subscriptionMonthly,
        subscription_yearly: subscriptionYearly,
        subscription_income: subscriptionIncome,
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
