// The platform's own revenue, defined once.
//
// The Finance page and the super admin Reports page both answer "what did this
// business earn, month by month". They were two copies of the same queries, the
// same month names and the same gap-filling loop, and they had already drifted.
// Extracting half of it was not enough: the general case - an arbitrary date
// range - stayed behind as a private second copy, untested, and it was the copy
// carrying the bug. Everything to do with the window lives here now.

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Longest series a chart will draw. Years of history is a chart nobody reads. */
export const MAX_SERIES_MONTHS = 24;

/**
 * What counts as money received.
 *
 * A constant AND the value the raw SQL binds, because presenting a constant
 * that four hand-written `WHERE status = 'paid'` clauses ignore is worse than
 * having no constant at all: widening the definition would move the headline
 * figures and leave the charts beneath them silently unchanged.
 */
export const PAID_STATUS = "paid";
export const PAID_SUBSCRIPTION_WHERE = { status: PAID_STATUS } as const;

/** A YYYY-MM-DD string as the first instant of that day, UTC. */
export const startOfDayUtc = (value: string): Date | undefined => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * Exclusive upper bound: the day after `value`, so the whole end day is
 * included whether the column is a DATE or a TIMESTAMP.
 */
export const dayAfterUtc = (value: string): Date | undefined => {
    const date = startOfDayUtc(value);
    if (!date) return undefined;
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
};

/**
 * The key a month's takings are filed under: YYYY-MM, in UTC.
 *
 * UTC because that is what the money is stored in. `date` on both payment
 * tables is a timestamp Prisma writes as UTC and Postgres `date_trunc` reads
 * back the same way, so a key built from the server's LOCAL month files the
 * money under the wrong bucket wherever the two disagree. At UTC+6 a payment
 * approved at 03:00 on the 1st is stored at 21:00 on the last day of the month
 * before: local says August, Postgres says July.
 */
export const monthKey = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const firstOfMonthUtc = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export type WindowInput = {
    /** YYYY-MM-DD. Without it the window is the last `monthsBack` months. */
    from?: string;
    /** YYYY-MM-DD. Without it the window ends with the current month. */
    to?: string;
    monthsBack?: number;
};

/**
 * The months a chart covers, and the bounds to filter the money by.
 *
 * Every boundary is UTC, start to finish. Parsing the range in local time and
 * then reading the month with UTC getters - which is what the Finance page did
 * - shifts the window: at UTC+6 a `from` of 2026-08-01 parses to 31 July 18:00
 * UTC, the window starts in July, and the chart draws a July bar carrying
 * revenue the summary cards above it do not count.
 *
 * The day is set before the month is stepped, which is the other half of it:
 * stepping back eleven months from 31 January asks for 31 February, there is no
 * such day, the date lands in March and the window silently starts a month
 * late.
 */
export const monthWindow = (input: WindowInput | number = {}, now: Date = new Date()) => {
    const { from, to, monthsBack = 12 }: WindowInput =
        typeof input === "number" ? { monthsBack: input } : input;

    // The month `to` FALLS IN, not the month after it. Taking the day after
    // first - which is what the exclusive filter bound needs - pushed an end
    // of 31 August into September, so a one-month filter drew two bars and
    // the second was always empty.
    const endMonth = firstOfMonthUtc(to ? startOfDayUtc(to) ?? now : now);

    let startMonth: Date;
    if (from) {
        startMonth = firstOfMonthUtc(startOfDayUtc(from) ?? now);
    } else {
        startMonth = new Date(endMonth);
        startMonth.setUTCMonth(startMonth.getUTCMonth() - (monthsBack - 1));
    }

    let months =
        (endMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 +
        (endMonth.getUTCMonth() - startMonth.getUTCMonth()) + 1;
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

export type MonthTotals = { month: string; total: number };

/**
 * Turns the rows Postgres grouped by month into a continuous series.
 *
 * Every month in the window gets an entry, empty ones included, so a quiet
 * month reads as zero rather than collapsing the axis onto the busy ones.
 *
 * Past twelve months the label carries the year. A 24-month window labelled
 * with bare month names puts two ticks called "Jan" on one axis with no way to
 * tell which year either belongs to - and the tooltip header is ambiguous for
 * the same reason.
 */
export const fillMonths = <T>(
    startMonth: Date,
    months: number,
    build: (key: string, label: string) => T,
): T[] => {
    const withYear = months > 12;
    const series: T[] = [];
    const cursor = new Date(startMonth);
    for (let index = 0; index < months; index += 1) {
        const name = MONTH_NAMES[cursor.getUTCMonth()];
        const label = withYear ? `${name} ${String(cursor.getUTCFullYear()).slice(2)}` : name;
        series.push(build(monthKey(cursor), label));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return series;
};

export const toMonthMap = (rows: MonthTotals[]): Map<string, number> =>
    new Map(rows.map((row) => [row.month, Number(row.total)]));

/**
 * Money, to the paisa.
 *
 * Amounts are Decimal(15,2) in Postgres and plain floats once Number() has had
 * them, so subtracting one sum from another leaves a residue: 300.30 - 100.10 -
 * 200.20 is 2.8e-14, not 0. A caller that tests "is there a remainder" against
 * zero then finds one on every install and renders a row reading ৳0.
 */
export const money2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;
