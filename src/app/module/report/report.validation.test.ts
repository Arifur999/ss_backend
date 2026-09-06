import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailReportZodSchema } from "./report.validation.js";

// The payload is composed in the browser, so the caps here are the only thing
// standing between one click and a megabyte of email. They are what this pins
// down - not the happy path, which is obvious, but the refusals.

const valid = {
    title: "Report",
    period: "September 2026",
    summary: [{ label: "Total Sales", value: "Tk 1,24,496" }],
    tables: [{ title: "Sales", columns: ["Name", "Amount"], rows: [["Dolna", "Tk 12,000"]] }],
};

const cell = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

describe("emailReportZodSchema", () => {
    it("takes a report shaped like the one the page builds", () => {
        assert.equal(emailReportZodSchema.safeParse(valid).success, true);
    });

    it("takes a report with nothing in it - an empty period still sends", () => {
        const empty = { title: "Report", period: "", summary: [], tables: [] };
        assert.equal(emailReportZodSchema.safeParse(empty).success, true);
    });

    it("insists on a title, since it becomes the subject line", () => {
        assert.equal(emailReportZodSchema.safeParse({ ...valid, title: "" }).success, false);
    });

    it("refuses a table longer than 200 rows", () => {
        const rows = Array.from({ length: 201 }, () => ["a", "b"]);
        const tooLong = { ...valid, tables: [{ title: "Sales", columns: ["Name", "Amount"], rows }] };
        assert.equal(emailReportZodSchema.safeParse(tooLong).success, false);

        const atTheLimit = { ...valid, tables: [{ ...tooLong.tables[0], rows: rows.slice(0, 200) }] };
        assert.equal(emailReportZodSchema.safeParse(atTheLimit).success, true);
    });

    it("refuses more than 10 tables, 10 columns or 40 summary figures", () => {
        const table = valid.tables[0];
        assert.equal(emailReportZodSchema.safeParse({
            ...valid, tables: Array.from({ length: 11 }, () => table),
        }).success, false);

        assert.equal(emailReportZodSchema.safeParse({
            ...valid, tables: [{ ...table, columns: cell(11) }],
        }).success, false);

        assert.equal(emailReportZodSchema.safeParse({
            ...valid, summary: Array.from({ length: 41 }, () => valid.summary[0]),
        }).success, false);
    });

    it("refuses a cell longer than 120 characters", () => {
        const long = "x".repeat(121);
        assert.equal(emailReportZodSchema.safeParse({ ...valid, title: long }).success, false);
        assert.equal(emailReportZodSchema.safeParse({
            ...valid, summary: [{ label: "Total", value: long }],
        }).success, false);
        assert.equal(emailReportZodSchema.safeParse({
            ...valid, tables: [{ ...valid.tables[0], rows: [[long]] }],
        }).success, false);
    });

    it("refuses anything that is not a string where a string belongs", () => {
        // A number here would reach the HTML builder and print "[object Object]"
        // or worse; escapeHtml is not a substitute for the type being right.
        assert.equal(emailReportZodSchema.safeParse({
            ...valid, summary: [{ label: "Total", value: 1234 }],
        }).success, false);
    });
});
