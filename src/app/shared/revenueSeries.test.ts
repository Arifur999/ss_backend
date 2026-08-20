import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillMonths, MAX_SERIES_MONTHS, MONTH_NAMES, monthKey, money2, monthWindow, toMonthMap } from "./revenueSeries.js";

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("monthWindow", () => {
    it("starts eleven months back and ends after this month", () => {
        const { startMonth, exclusiveEnd, months } = monthWindow(12, new Date("2026-08-20T10:00:00Z"));
        assert.equal(iso(startMonth), "2025-09-01");
        assert.equal(iso(exclusiveEnd), "2026-09-01");
        assert.equal(months, 12);
    });

    it("does not roll over on a day the target month does not have", () => {
        // The bug this replaced: stepping back eleven months from 31 January
        // asks for 31 February, which does not exist, so the date landed in
        // March and the window started a month late - February's revenue fell
        // out of the chart and the last slot was a future month drawn empty.
        const { startMonth, exclusiveEnd } = monthWindow(12, new Date("2027-01-31T23:59:00Z"));
        assert.equal(iso(startMonth), "2026-02-01");
        assert.equal(iso(exclusiveEnd), "2027-02-01");
    });

    it("holds on every awkward day of the year", () => {
        // 29, 30 and 31 of any month whose target is shorter.
        for (const day of ["2027-01-29", "2027-01-30", "2027-03-31", "2027-05-31", "2027-08-31", "2027-10-31"]) {
            const from = new Date(`${day}T12:00:00Z`);
            const { startMonth } = monthWindow(12, from);
            assert.equal(startMonth.getUTCDate(), 1, `${day} must start on the 1st`);
            const monthsApart =
                (from.getUTCFullYear() - startMonth.getUTCFullYear()) * 12
                + (from.getUTCMonth() - startMonth.getUTCMonth());
            assert.equal(monthsApart, 11, `${day} must look back exactly eleven months`);
        }
    });

    it("covers a window of any length", () => {
        const { startMonth, months } = monthWindow(24, new Date("2026-08-20T10:00:00Z"));
        assert.equal(iso(startMonth), "2024-09-01");
        assert.equal(months, 24);
    });
});

describe("monthKey", () => {
    it("files money under the month Postgres groups it by", () => {
        // date_trunc reads the stored UTC value, so the key has to be UTC too.
        // At UTC+6 a payment approved at 03:00 on 1 August is stored as
        // 2026-07-31T21:00Z: local says August, the database says July, and the
        // money lands in the wrong bar - or outside the window and vanishes.
        assert.equal(monthKey(new Date("2026-07-31T21:00:00Z")), "2026-07");
        assert.equal(monthKey(new Date("2026-08-01T00:00:00Z")), "2026-08");
    });

    it("pads a single-digit month", () => {
        assert.equal(monthKey(new Date("2026-01-15T00:00:00Z")), "2026-01");
        assert.equal(monthKey(new Date("2026-12-15T00:00:00Z")), "2026-12");
    });
});

describe("fillMonths", () => {
    it("gives every month in the window an entry, empty ones included", () => {
        const { startMonth, months } = monthWindow(12, new Date("2026-08-20T10:00:00Z"));
        const totals = toMonthMap([{ month: "2026-08", total: 599 }]);
        const series = fillMonths(startMonth, months, (key, month) => ({
            month,
            total: totals.get(key) ?? 0,
        }));

        assert.equal(series.length, 12);
        assert.equal(series[0].month, "Sep");
        assert.equal(series[11].month, "Aug");
        assert.equal(series[11].total, 599);
        // A quiet month reads as zero rather than collapsing the axis.
        assert.equal(series.filter((row) => row.total === 0).length, 11);
    });

    it("steps months in UTC, so it cannot skip or repeat one", () => {
        const { startMonth, months } = monthWindow(12, new Date("2027-01-31T23:59:00Z"));
        const keys = fillMonths(startMonth, months, (key) => key);
        assert.equal(keys.length, 12);
        assert.equal(new Set(keys).size, 12, "no month appears twice");
        assert.equal(keys[0], "2026-02");
        assert.equal(keys[11], "2027-01");
    });

    it("names months from one array", () => {
        assert.equal(MONTH_NAMES.length, 12);
        assert.equal(MONTH_NAMES[0], "Jan");
        assert.equal(MONTH_NAMES[11], "Dec");
    });
});

describe("toMonthMap", () => {
    it("reads the totals Postgres returns as numbers", () => {
        const map = toMonthMap([{ month: "2026-08", total: 1234.5 }]);
        assert.equal(map.get("2026-08"), 1234.5);
        assert.equal(map.get("2026-07"), undefined);
    });
});

describe("monthWindow with a range", () => {
    it("keeps a whole-month filter inside that month", () => {
        // The bug this replaced: the range was parsed in local time and the
        // month read with UTC getters, so at UTC+6 a "from" of 2026-08-01
        // became 31 July 18:00 UTC and the window started in July - the chart
        // drew a July bar carrying revenue the summary cards excluded.
        const { startMonth, exclusiveEnd, months } = monthWindow({ from: "2026-08-01", to: "2026-08-31" });
        assert.equal(iso(startMonth), "2026-08-01");
        assert.equal(iso(exclusiveEnd), "2026-09-01");
        assert.equal(months, 1);
    });

    it("covers every month a range touches", () => {
        const { startMonth, exclusiveEnd, months } = monthWindow({ from: "2026-01-15", to: "2026-06-10" });
        assert.equal(iso(startMonth), "2026-01-01");
        assert.equal(iso(exclusiveEnd), "2026-07-01");
        assert.equal(months, 6);
    });

    it("does not run past the end month on a range with no start", () => {
        const { startMonth, exclusiveEnd, months } = monthWindow({ to: "2026-08-31" });
        assert.equal(iso(exclusiveEnd), "2026-09-01");
        assert.equal(iso(startMonth), "2025-09-01");
        assert.equal(months, 12);
    });

    it("caps a very long range rather than drawing hundreds of bars", () => {
        const { months, startMonth, exclusiveEnd } = monthWindow({ from: "2019-01-01", to: "2026-08-31" });
        assert.equal(months, MAX_SERIES_MONTHS);
        assert.equal(iso(exclusiveEnd), "2026-09-01");
        // The cap trims the START, so the window still ends where asked.
        assert.equal(iso(startMonth), "2024-09-01");
    });

    it("never returns fewer than one month", () => {
        const { months } = monthWindow({ from: "2026-12-01", to: "2026-01-01" });
        assert.equal(months, 1);
    });
});

describe("fillMonths labels", () => {
    it("names the year once a window can repeat a month", () => {
        // A 24-month window labelled with bare names puts two ticks called
        // "Jan" on one axis with no way to tell which year either is.
        const { startMonth, months } = monthWindow({ from: "2025-01-01", to: "2026-06-30" });
        const labels = fillMonths(startMonth, months, (_key, label) => label);
        assert.equal(labels.length, 18);
        assert.equal(new Set(labels).size, 18, "every label is distinct");
        assert.equal(labels[0], "Jan 25");
        assert.equal(labels[17], "Jun 26");
    });

    it("leaves the year off a window that cannot repeat one", () => {
        const { startMonth, months } = monthWindow(12, new Date("2026-08-20T10:00:00Z"));
        const labels = fillMonths(startMonth, months, (_key, label) => label);
        assert.equal(labels[0], "Sep");
        assert.equal(labels[11], "Aug");
    });
});

describe("money2", () => {
    it("leaves no residue when one sum is taken off another", () => {
        // Decimal(15,2) through Number() is a float: 300.30 - 100.10 - 200.20
        // is 2.8e-14, and a caller testing "is there a remainder" against zero
        // finds one on every install and draws a row reading Tk 0.
        assert.equal(money2(300.30 - 100.10 - 200.20), 0);
        assert.equal(money2((12345.67 + 8901.23) - 12345.67 - 8901.23), 0);
        assert.notEqual(300.30 - 100.10 - 200.20, 0);
    });

    it("keeps the paisa", () => {
        assert.equal(money2(599.994), 599.99);
        assert.equal(money2(599.995), 600);
        assert.equal(money2(-0.004), -0);
    });

    it("reads anything that is not a number as nil", () => {
        assert.equal(money2(NaN), 0);
        assert.equal(money2(undefined as unknown as number), 0);
    });
});
