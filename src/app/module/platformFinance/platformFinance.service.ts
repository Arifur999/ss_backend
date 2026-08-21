import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { dayAfterUtc, fillMonths, money2, monthWindow, PAID_STATUS, PAID_SUBSCRIPTION_WHERE, startOfDayUtc, toMonthMap } from "../../shared/revenueSeries.js";
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

// The range parsers come from shared/revenueSeries and parse in UTC. They
// used to parse locally here while the month boundaries were read with UTC
// getters: at UTC+6 a "from" of 2026-08-01 became 31 July 18:00 UTC, so the
// chart drew a July bar carrying revenue the cards above it did not count.
const startOfDay = startOfDayUtc;
const dayAfter = dayAfterUtc;

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

// The months the chart should cover: with no filter, the last 12; with one,
// the months the filter spans.
//
// The chart is bounded by the SAME dates as the cards, not by whole months.
// Filtering 10-20 August used to total eleven days on the cards and draw the
// whole of August underneath them - one page, two answers. The window still
// decides which month labels appear; the money inside them is the money the
// operator asked for.
const seriesBounds = (range: DateRange) => monthWindow({ from: range.from, to: range.to });

const getSummary = async (range: DateRange) => {
    const where = whereForRange(range);
    const { startMonth, exclusiveEnd, months } = seriesBounds(range);
    // The exact bounds the cards use, falling back to the month window when the
    // filter is open-ended, so both halves of the page read the same rows.
    const seriesFrom = range.from ? startOfDayUtc(range.from) ?? startMonth : startMonth;
    const seriesTo = range.to ? dayAfterUtc(range.to) ?? exclusiveEnd : exclusiveEnd;

    const [byPlan, sms, expenses, withdrawals, subscriptionSeries, smsSeries, expenseSeries] = await Promise.all([
        // Only money actually received counts as income - a pending payment is
        // not revenue until it clears.
        prisma.subscriptionPayment.groupBy({
            by: ["plan_type"],
            where: { ...PAID_SUBSCRIPTION_WHERE, ...where },
            _sum: { amount: true },
        }),
        prisma.smsPurchase.aggregate({
            where: { ...PAID_SUBSCRIPTION_WHERE, ...where },
            _sum: { amount: true },
        }),
        prisma.platformExpense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
        prisma.platformWithdrawal.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM subscription_payments
            WHERE status = ${PAID_STATUS} AND date >= ${seriesFrom} AND date < ${seriesTo}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM sms_purchases
            WHERE status = ${PAID_STATUS} AND date >= ${seriesFrom} AND date < ${seriesTo}
            GROUP BY 1
            ORDER BY 1
        `,
        prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   COALESCE(SUM(amount), 0)::float AS total
            FROM platform_expenses
            WHERE date >= ${seriesFrom} AND date < ${seriesTo}
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
    const subscriptionIncome = money2(byPlan.reduce((sum, row) => sum + toNumber(row._sum.amount), 0));
    // What the two named plans do not account for. The card shows the total
    // with "Monthly X - Yearly Y" beneath it, and without this that subtitle
    // stops adding up the moment a paid row carries any other plan_type.
    const subscriptionOther = money2(subscriptionIncome - subscriptionMonthly - subscriptionYearly);
    // Every figure to the paisa. The page decides a card's colour with
    // `profit < 0` and `available < 0`, and a float subtraction of two Decimal
    // sums leaves a residue of about 1e-17 - so an operator who is exactly
    // square was shown a red card reading Tk 0 and told they were overdrawn.
    const smsIncome = money2(toNumber(sms._sum.amount));
    const totalIncome = money2(subscriptionIncome + smsIncome);
    const totalExpense = money2(toNumber(expenses._sum.amount));
    const totalWithdrawn = money2(toNumber(withdrawals._sum.amount));
    const profit = money2(totalIncome - totalExpense);

    const subscriptionByMonth = toMonthMap(subscriptionSeries);
    const smsByMonth = toMonthMap(smsSeries);
    const expenseByMonth = toMonthMap(expenseSeries);

    const monthly = fillMonths(startMonth, months, (key, month) => {
        const subscription = money2(subscriptionByMonth.get(key) ?? 0);
        const smsAmount = money2(smsByMonth.get(key) ?? 0);
        const expense = money2(expenseByMonth.get(key) ?? 0);
        return {
            month,
            income: money2(subscription + smsAmount),
            subscription,
            sms: smsAmount,
            expense,
            // Rounded like the rest: the chart plots this, and a break-even
            // month left at -5.5e-17 draws as a bar below the axis.
            profit: money2(subscription + smsAmount - expense),
        };
    });

    return {
        subscription_monthly: subscriptionMonthly,
        subscription_yearly: subscriptionYearly,
        subscription_income: subscriptionIncome,
        subscription_other: subscriptionOther,
        sms_income: smsIncome,
        total_income: totalIncome,
        total_expense: totalExpense,
        expense_count: expenses._count._all,
        profit,
        total_withdrawn: totalWithdrawn,
        withdrawal_count: withdrawals._count._all,
        // What is left after paying the bills and taking money out - the number
        // that answers "how much can I still take".
        available: money2(profit - totalWithdrawn),
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
