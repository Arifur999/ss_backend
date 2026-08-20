import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillMonths, MONTH_NAMES, monthKey, monthWindow, toMonthMap } from "./revenueSeries.js";

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
