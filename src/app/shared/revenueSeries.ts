// The platform's own revenue, defined once.
//
// The Finance page and the super admin Reports page both answer "what did this
// business earn, month by month". They were two copies of the same three raw
// queries, the same month names, the same gap-filling loop - and they had
// already drifted: one bounded the window at both ends and the other only at
// the start, one called subscription income monthly+yearly and the other summed
// every paid row. Two pages, one database, two answers.

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The key a month's takings are filed under: YYYY-MM, in UTC.
 *
 * UTC because that is what the money is stored in. `date` on both payment
 * tables is a timestamp Prisma writes as UTC, and Postgres `date_trunc` reads
 * it back the same way - so a key built from the server's LOCAL month puts the
 * money in the wrong bucket wherever the two disagree. At UTC+6, a payment
 * approved at 03:00 on the 1st is stored at 21:00 on the last day of the month
 * before: local says August, Postgres says July, and the amount either lands in
 * the previous bar or falls outside the window and vanishes from the chart
 * while still counting in the headline.
 */
export const monthKey = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * The first instant of the month `monthsBack - 1` months before this one, and
 * the first instant of the month after this one.
 *
 * Built by setting the day BEFORE the month, which is the whole point: doing it
 * the other way round rolls over. On 31 January, stepping back eleven months
 * asks for 31 February; there is no such day, so the date lands in March and
 * the window silently starts a month late - February's revenue disappears from
 * the chart and the last slot is a future month drawn as an empty bar. The same
 * on the 29th, 30th and 31st of any month whose target is shorter.
 */
export const monthWindow = (monthsBack: number, from: Date = new Date()) => {
    const startMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    startMonth.setUTCMonth(startMonth.getUTCMonth() - (monthsBack - 1));

    const exclusiveEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    exclusiveEnd.setUTCMonth(exclusiveEnd.getUTCMonth() + 1);

    return { startMonth, exclusiveEnd, months: monthsBack };
};

export type MonthTotals = { month: string; total: number };

/**
 * Turns the rows Postgres grouped by month into a continuous series.
 *
 * Every month in the window gets an entry, empty ones included, so a quiet
 * month reads as zero rather than collapsing the axis onto the busy ones.
 */
export const fillMonths = <T>(
    startMonth: Date,
    months: number,
    build: (key: string, monthName: string) => T,
): T[] => {
    const series: T[] = [];
    const cursor = new Date(startMonth);
    for (let index = 0; index < months; index += 1) {
        series.push(build(monthKey(cursor), MONTH_NAMES[cursor.getUTCMonth()]));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return series;
};

export const toMonthMap = (rows: MonthTotals[]): Map<string, number> =>
    new Map(rows.map((row) => [row.month, Number(row.total)]));

/**
 * What counts as subscription income: every payment that has been approved.
 *
 * Not monthly+yearly. plan_type is a PlanType column that also permits
 * free_trial, so a paid row carrying anything but those two was inside one
 * page's total and outside the other's - and outside the "where the money comes
 * from" panel, which then did not add up to the figure above it. Summing the
 * status rather than enumerating the plans cannot leave money out.
 */
export const PAID_SUBSCRIPTION_WHERE = { status: "paid" } as const;
