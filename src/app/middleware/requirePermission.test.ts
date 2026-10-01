import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Role } from "../../generated/prisma/enums.js";
import { requirePermission } from "./requirePermission.js";

/**
 * The gate itself, which had no test until the permission vocabulary was
 * rewritten around it.
 *
 * Everything in this file is an escape hatch or a boundary that something else
 * in the app now depends on being exactly this shape - RequirePage on the
 * frontend mirrors it decision for decision, and the whole upgrade story rests
 * on the empty-list rule. Worth pinning down.
 *
 * No database, no env: the middleware reads req.user and nothing else, which is
 * what lets this run in CI where there is no .env file.
 */

type Outcome = { ok: true } | { ok: false; status: number; message: string };

/** Run the middleware against a user and report which way it went. */
function run(user: unknown, ...allowed: string[]): Outcome {
    let outcome: Outcome = { ok: true };
    const next: NextFunction = ((error?: unknown) => {
        if (error) {
            const failure = error as { statusCode: number; message: string };
            outcome = { ok: false, status: failure.statusCode, message: failure.message };
        }
    }) as NextFunction;

    requirePermission(...(allowed as never[]))(
        { user } as unknown as Request,
        {} as Response,
        next
    );
    return outcome;
}

const staff = (permissions: string[], role: Role = Role.manager) => ({ role, permissions });

describe("requirePermission", () => {
    it("passes an owner whatever is ticked", () => {
        // There would be no way back from locking an owner out of their own
        // workspace with a checkbox.
        assert.equal(run(staff([], Role.owner), "page:sales.ledger").ok, true);
        assert.equal(run(staff(["page:customers.list"], Role.owner), "page:sales.ledger").ok, true);
        assert.equal(run(staff(["nonsense"], Role.owner), "act:sales.delete").ok, true);
    });

    it("passes a super_admin", () => {
        assert.equal(run(staff([], Role.super_admin), "page:sales.ledger").ok, true);
        assert.equal(run(staff(["page:customers.list"], Role.super_admin), "act:sales.delete").ok, true);
    });

    /**
     * The rule the whole upgrade rests on.
     *
     * Every existing team member has an empty array on the morning of a deploy.
     * If this ever stopped passing, every one of them would lose access to
     * everything at once - and because permissions are read from the database
     * per request, a bad deploy would lock out a live workspace immediately.
     */
    it("passes anyone whose list is empty", () => {
        assert.equal(run(staff([]), "page:sales.ledger").ok, true);
        assert.equal(run({ role: Role.sales_staff }, "page:sales.ledger").ok, true);
        assert.equal(run({ role: Role.sales_staff, permissions: null }, "page:sales.ledger").ok, true);
    });

    it("restricts once boxes have been ticked", () => {
        assert.equal(run(staff(["page:customers.list"]), "page:sales.ledger").ok, false);
        assert.equal(run(staff(["page:sales.ledger"]), "page:sales.ledger").ok, true);
    });

    it("is any-of, not all-of", () => {
        // READS unions lean on this entirely: GET /accounts lists twenty-odd page
        // permissions and holding any one of them is enough.
        const user = staff(["page:balance.wallet"]);
        assert.equal(run(user, "page:balance.overview", "page:balance.wallet").ok, true);
        assert.equal(run(user, "page:balance.overview", "page:balance.ledger").ok, false);
    });

    it("refuses a request with no user at all as unauthorized, not forbidden", () => {
        // 401 and 403 are not interchangeable here: the http client retries a 401
        // through a silent token refresh and surfaces a 403 to the user.
        const outcome = run(undefined, "page:sales.ledger");
        assert.equal(outcome.ok, false);
        if (!outcome.ok) assert.equal(outcome.status, 401);
    });

    it("names the missing permission the way the owner will read it", () => {
        // "Ask the owner to enable: page:sales.ledger" is a stack trace pointed at
        // a colleague. The box and tick they need to ask for is the difference
        // between one click and a bug report.
        const outcome = run(staff(["page:customers.list"]), "page:sales.ledger", "page:sales.history");
        assert.equal(outcome.ok, false);
        if (!outcome.ok) {
            assert.equal(outcome.status, 403);
            assert.match(outcome.message, /Sales - Ledger or Sales - History/);
            assert.ok(!outcome.message.includes("page:"), "the raw stored name leaked into the message");
        }
    });
});
