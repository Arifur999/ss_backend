import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SupportTicketStatus } from "../../../generated/prisma/enums.js";
import { canMarkSolved, isAwaitingReply, statusAfterMessage, subjectFrom } from "./supportRules.js";

describe("where a ticket stands after somebody writes", () => {
    it("waits on the platform when the customer writes", () => {
        assert.equal(statusAfterMessage(false), SupportTicketStatus.open);
    });

    it("waits on the customer once the platform answers", () => {
        assert.equal(statusAfterMessage(true), SupportTicketStatus.answered);
    });

    it("reopens a solved ticket the customer comes back on", () => {
        // Refusing the message would push somebody whose problem returned into
        // opening a second ticket, splitting the history that made the first
        // one worth keeping.
        assert.equal(statusAfterMessage(false), SupportTicketStatus.open);
    });
});

describe("who may close a ticket", () => {
    it("is the platform", () => {
        assert.equal(canMarkSolved("super_admin"), true);
    });

    it("is not the customer, nor their staff", () => {
        for (const role of ["owner", "manager", "sales_staff", "accountant", ""]) {
            assert.equal(canMarkSolved(role), false, `${role} must not close a ticket`);
        }
    });
});

describe("what the inbox counts", () => {
    it("counts a ticket nobody has answered", () => {
        assert.equal(isAwaitingReply(SupportTicketStatus.open), true);
    });

    it("does not count one already answered or closed", () => {
        assert.equal(isAwaitingReply(SupportTicketStatus.answered), false);
        assert.equal(isAwaitingReply(SupportTicketStatus.solved), false);
    });
});

describe("the subject a ticket is listed under", () => {
    it("uses what was typed", () => {
        assert.equal(subjectFrom("CSV upload fails", "the file does nothing"), "CSV upload fails");
    });

    it("falls back to the first line of the message", () => {
        assert.equal(subjectFrom("", "Cannot print invoices\nsince this morning"), "Cannot print invoices");
    });

    it("shortens a long one rather than letting it break the row", () => {
        const long = "x".repeat(200);
        const out = subjectFrom(long, "");
        assert.equal(out.length, 80);
        assert.ok(out.endsWith("\u2026"));
    });

    it("never lands on an empty label", () => {
        assert.equal(subjectFrom("   ", "   "), "Support request");
    });

    it("ignores surrounding whitespace", () => {
        assert.equal(subjectFrom("  Printer  ", ""), "Printer");
    });
});
