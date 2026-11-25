import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIRST_MEMO_SEQ, memoPrefix, nextMemoNo } from "./receiveMemoNo.js";

const NOV_2026 = new Date("2026-11-25T10:00:00Z");

describe("memoPrefix", () => {
    it("is the two-digit year and month", () => {
        assert.equal(memoPrefix(NOV_2026), "RCV-2611-");
    });

    it("pads a single-digit month", () => {
        assert.equal(memoPrefix(new Date("2027-01-03T00:00:00Z")), "RCV-2701-");
    });
});

describe("nextMemoNo", () => {
    it("starts the month at 1001", () => {
        assert.equal(nextMemoNo([], NOV_2026), `RCV-2611-${FIRST_MEMO_SEQ}`);
    });

    it("follows the highest number already issued", () => {
        assert.equal(nextMemoNo(["RCV-2611-1001", "RCV-2611-1002"], NOV_2026), "RCV-2611-1003");
    });

    it("follows the highest, not the last one handed to it", () => {
        // Rows come back in whatever order the query gave them.
        assert.equal(nextMemoNo(["RCV-2611-1007", "RCV-2611-1002"], NOV_2026), "RCV-2611-1008");
    });

    /**
     * Last month's numbers are not this month's business. Were they counted,
     * a workspace's memo numbers would climb forever and stop saying which
     * delivery of the month they were.
     */
    it("restarts each month", () => {
        assert.equal(nextMemoNo(["RCV-2610-1400"], NOV_2026), "RCV-2611-1001");
    });

    /**
     * A number that does not parse must not become the basis of the next one.
     * "RCV-2611-NaN" would then be issued to a real delivery, and would clash
     * with the next one just like it.
     */
    it("ignores anything it cannot read", () => {
        const odd = ["RCV-2611-", "RCV-2611-abc", "RCV-2611-10 01", "", "RCV-2611-1002-1"];
        assert.equal(nextMemoNo(odd, NOV_2026), "RCV-2611-1001");
        assert.equal(nextMemoNo([...odd, "RCV-2611-1005"], NOV_2026), "RCV-2611-1006");
    });

    it("ignores values that are not strings at all", () => {
        const rows = [null, undefined, 7, {}, "RCV-2611-1003"] as unknown as string[];
        assert.equal(nextMemoNo(rows, NOV_2026), "RCV-2611-1004");
    });

    it("keeps four digits, and grows past them rather than wrapping", () => {
        assert.equal(nextMemoNo(["RCV-2611-9999"], NOV_2026), "RCV-2611-10000");
    });
});
