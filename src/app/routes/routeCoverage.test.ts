import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { READS } from "../shared/permissions.js";

// ---------------------------------------------------------------------------
// Every endpoint has to justify itself in one of three ways.
//
// This is the keystone of the permission work. The audit that started it counted
// 218 endpoints, of which 65 carried requirePermission and 153 did not - and 77
// of those 153 were reachable by an ordinary team member. Among them:
// GET /account-transfers and GET /sale-payments (the money book),
// POST /products/bulk-update-prices (repricing the catalogue) and
// POST /recycle-bin/:id/restore.
//
// Fixing them once is worth little if the number can creep back. So every route
// in the app must either
//
//   (a) restrict checkAuth to owner and/or super_admin - the role is the gate, or
//   (b) carry requirePermission, or
//   (c) appear in INTENTIONALLY_OPEN below with a reason written down.
//
// Adding an endpoint without doing one of those three fails this test, and the
// only way to make it pass is to state the decision where a reviewer will read
// it. No .env, no database, no server: it reads the route files as text.
// ---------------------------------------------------------------------------

const MODULES = path.resolve(import.meta.dirname, "../module");

/**
 * Endpoints deliberately reachable by any signed-in member, and why.
 *
 * Every line is a decision, not an exemption to be extended casually. The key is
 * "<file basename> <METHOD> <path>".
 */
const INTENTIONALLY_OPEN: Record<string, string> = {
    // ---- public, pre-auth -------------------------------------------------
    "auth POST /login": "signing in",
    "auth POST /register": "creating an owner account",
    "auth POST /verify-otp": "confirming the emailed code",
    "auth POST /resend-otp": "asking for a fresh code",
    "auth POST /refresh-token": "silent session refresh",
    "auth POST /logout": "ending a session",
    "auth POST /forgot-password": "password reset request",
    "auth POST /reset-password": "password reset",
    "auth GET /me": "who am I - every page needs this before it can gate anything",
    "auth POST /touch-activity": "an activity heartbeat, no business data",

    // ---- your own account -------------------------------------------------
    "user PUT /me": "editing your own name and photo is not a permission",

    /* ---- reference lookups, rule R3 ---------------------------------------
     * A short list with no money in it, needed by every form with a dropdown.
     * Gating these breaks six to twelve pages each, and enumerating a category
     * list is not a capability worth a checkbox.
     *
     * Every one of these was ALREADY open before this work. Nothing that was
     * gated has been opened - GET /suppliers looks like it belongs here and is
     * deliberately not, because it was behind "View Supplier" and opening it
     * would be this change widening access rather than narrowing it. It gets
     * READS.suppliers instead.
     */
    "product GET /categories": "R3 reference list - every product form's dropdown",
    "product GET /ids": "R3 reference list - code lookup while typing",
    "expenseCategory GET /": "R3 reference list - the expense form's dropdown",
    "businessSettings GET /": "R3 - invoice branding, read by eleven pages including every print view",
    "platformSettings GET /payment-info": "R3 - the bKash number on the Buy SMS screen",

    // ---- deliberately open, with a reason, rule R7 ------------------------
    "upload POST /image": "rate-limited; gating it would gate every page with a photo field",
    "draft GET /": "a draft is private to its author and publishing goes through the gated POST /sales",
    "draft POST /": "see draft GET /",
    "draft GET /:id": "see draft GET /",
    "draft PATCH /:id": "see draft GET /",
    "draft DELETE /:id": "see draft GET /",
    "support POST /": "support is every role by design - it is what you reach for when the menu stops making sense",
    "support GET /my": "see support POST /",
    "support GET /stream": "see support POST /",
    "support POST /:id/reply": "see support POST /",
    "support POST /:id/typing": "see support POST /",
    "activity GET /day": "an activity heartbeat, no business data",
    "notification GET /my": "your own notifications",
    "notification POST /mark-read": "your own notifications",
    "subscription GET /my": "your own workspace's plan, shown in the header",
    "subscription GET /my-payments": "your own workspace's billing history",
};

type Endpoint = {
    file: string;
    method: string;
    routePath: string;
    /** The whole router.x(...) call, whitespace collapsed. */
    call: string;
    key: string;
};

/** Every *.route.ts under module/, read as text. */
function routeFiles(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(MODULES)) {
        const dir = path.join(MODULES, entry);
        if (!statSync(dir).isDirectory()) continue;
        for (const file of readdirSync(dir)) {
            if (file.endsWith(".route.ts")) out.push(path.join(dir, file));
        }
    }
    return out;
}

/**
 * Pull the endpoints out of a route file.
 *
 * Reads each `router.<verb>(...)` call by walking forward from the opening paren
 * until the parens balance, rather than matching a single line. That matters:
 * report.route.ts and upload.route.ts both spread a call over seven lines, and a
 * line-based version of this test silently skipped them - which is the exact
 * failure mode a coverage test must not have. A route it cannot see is a route it
 * declares safe.
 */
function endpointsIn(file: string): Endpoint[] {
    const source = readFileSync(file, "utf8");
    const basename = path.basename(file).replace(".route.ts", "");
    const out: Endpoint[] = [];
    const opener = /router\.(get|post|put|patch|delete)\s*\(/g;

    let match: RegExpExecArray | null;
    while ((match = opener.exec(source)) !== null) {
        let depth = 0;
        let end = -1;
        for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
            const character = source[index];
            if (character === "(") depth += 1;
            else if (character === ")") {
                depth -= 1;
                if (depth === 0) { end = index; break; }
            }
        }
        if (end === -1) continue;

        const call = source.slice(match.index, end + 1);
        const routePath = call.match(/^router\.\w+\s*\(\s*["'`]([^"'`]*)["'`]/);
        if (!routePath) continue;

        const method = match[1].toUpperCase();
        out.push({
            file: basename,
            method,
            routePath: routePath[1],
            call: call.replace(/\s+/g, " "),
            key: `${basename} ${method} ${routePath[1]}`,
        });
    }
    return out;
}

const ALL = routeFiles().flatMap(endpointsIn);

/**
 * Does this call restrict checkAuth to owner and/or super_admin only?
 *
 * Anything else counts as "reachable by a team member", including the spread
 * forms - `checkAuth(...payRoles)` and `checkAuth(...Object.values(Role))` - which
 * cannot be resolved from the text and must therefore be assumed wide. Assuming
 * wide is the safe direction: it demands a permission or a written reason.
 */
function roleGated(call: string): boolean {
    const args = call.match(/checkAuth\(([^)]*)\)/);
    if (!args) return false;
    const inner = args[1].trim();
    if (inner === "") return false; // checkAuth() is every role
    if (inner.includes("...")) return false; // a spread - unresolvable, assume wide
    const roles = inner.split(",").map((part) => part.trim()).filter(Boolean);
    return roles.every((role) => role === "Role.owner" || role === "Role.super_admin");
}

const hasPermissionGate = (call: string) => call.includes("requirePermission(");

describe("route coverage", () => {
    it("finds the route files at all", () => {
        // If the layout of the repo moves, every other assertion here would pass
        // vacuously. This is the canary.
        assert.ok(routeFiles().length > 30, `only found ${routeFiles().length} route files`);
        assert.ok(ALL.length > 200, `only parsed ${ALL.length} endpoints`);
    });

    it("gates every endpoint by role, by permission, or by a written-down exception", () => {
        const unjustified = ALL.filter(
            (endpoint) =>
                !roleGated(endpoint.call) &&
                !hasPermissionGate(endpoint.call) &&
                !(endpoint.key in INTENTIONALLY_OPEN)
        );

        assert.deepEqual(
            unjustified.map((endpoint) => endpoint.key),
            [],
            `\n${unjustified.length} endpoint(s) reachable by any team member with no gate and no stated reason.\n` +
            `Add requirePermission, tighten checkAuth, or add an entry to INTENTIONALLY_OPEN with a reason:\n` +
            unjustified.map((endpoint) => `  ${endpoint.key}`).join("\n") + "\n"
        );
    });

    it("keeps INTENTIONALLY_OPEN honest", () => {
        // An entry for an endpoint that no longer exists is worse than no entry:
        // it reads as a considered decision about live code.
        const keys = new Set(ALL.map((endpoint) => endpoint.key));
        const stale = Object.keys(INTENTIONALLY_OPEN).filter((key) => !keys.has(key));
        assert.deepEqual(stale, [], `INTENTIONALLY_OPEN names endpoints that do not exist:\n  ${stale.join("\n  ")}`);
    });

    it("gives every exception a reason rather than a placeholder", () => {
        // Not a length check. "signing in" is a complete reason and padding it out
        // would make the list worse, not better. What this catches is the entry
        // added in a hurry with nothing behind it.
        for (const [key, reason] of Object.entries(INTENTIONALLY_OPEN)) {
            assert.ok(reason.trim().length > 0, `${key} has no reason at all`);
            assert.ok(
                !/^(todo|tbd|n\/?a|fixme|\?+|-+)$/i.test(reason.trim()),
                `${key} has a placeholder instead of a reason: "${reason}"`
            );
        }
    });

    it("puts requirePermission after checkAuth, never instead of it", () => {
        // The role gate is the outer boundary and requirePermission cannot widen
        // it. A route with a permission but no checkAuth would have no req.user
        // to read, and the middleware would 401 every caller.
        for (const endpoint of ALL) {
            if (!hasPermissionGate(endpoint.call)) continue;
            assert.ok(endpoint.call.includes("checkAuth"), `${endpoint.key} has a permission but no checkAuth`);
            assert.ok(
                endpoint.call.indexOf("checkAuth") < endpoint.call.indexOf("requirePermission"),
                `${endpoint.key} runs requirePermission before checkAuth`
            );
        }
    });

    it("never gates an endpoint behind a delete tick and a page at once", () => {
        // requirePermission is any-of, so listing both would grant either - which
        // reads like "and" and behaves like "or". Deletes take act: alone.
        for (const endpoint of ALL) {
            const call = endpoint.call.match(/requirePermission\(([^)]*)\)/);
            if (!call) continue;
            const names = call[1];
            if (!names.includes("act:")) continue;
            assert.ok(
                !names.includes("page:"),
                `${endpoint.key} mixes a delete tick with a page permission, which reads as AND but behaves as OR`
            );
        }
    });
});

/**
 * What one concrete restricted user can actually reach.
 *
 * The assertions above prove every endpoint has *a* gate. These prove the gates
 * are the right ones, by taking a plausible sales person - they may take an order
 * and look up a customer, nothing else - and checking the specific doors that were
 * standing open before this work.
 *
 * Evaluated against the real READS unions, so a well-meaning widening of one of
 * them fails here rather than in production.
 */
describe("a sales person who may take orders and look up customers", () => {
    const granted = ["page:dashboard.overview", "page:sales.new", "page:customers.list"];
    const holds = (names: readonly string[]) => names.some((name) => granted.includes(name));

    it("keeps the payment-method dropdown on the Sales screen", () => {
        // The live bug this fixes: GET /accounts required "View Balance" while
        // sixteen pages read it, so any staff member with a single tick got an
        // empty dropdown and no error, because the shim turns a 403 into [].
        assert.ok(holds(READS.accounts), "a sales person cannot read accounts");
    });

    it("can still look up the products and stock they are selling", () => {
        assert.ok(holds(READS.products));
        assert.ok(holds(READS.inventory));
        assert.ok(holds(READS.customers));
    });

    it("cannot read the money-movement book", () => {
        // GET /account-transfers was reachable by any team member with no gate at
        // all, and it returns every transfer between the business's accounts.
        assert.ok(!holds(READS.accountTransfers), "a sales person can read account transfers");
    });

    it("cannot read the expense book, the supplier payments or the loans", () => {
        assert.ok(!holds(READS.expenses), "expenses are readable");
        assert.ok(!holds(READS.supplierPayments), "supplier payments are readable");
        assert.ok(!holds(READS.loans), "loans are readable");
        assert.ok(!holds(READS.otherIncomes), "other income is readable");
        assert.ok(!holds(READS.shareholders), "shareholder figures are readable");
        assert.ok(!holds(READS.salaryTransactions), "salaries are readable");
    });

    it("cannot read the purchase book", () => {
        assert.ok(!holds(READS.purchases), "purchases are readable");
    });

    /**
     * Supplier names ARE readable, and that is a fix rather than a leak.
     *
     * Sales.tsx reads suppliers for a dropdown. Before this work GET /suppliers
     * required "View Supplier", which a sales person did not have - so the
     * dropdown was already silently empty for them, the same way the payment
     * dropdown was. Granting it is what makes the page work, not what opens it.
     */
    it("can read supplier names, which the Sales screen needs for its dropdown", () => {
        assert.ok(holds(READS.suppliers));
    });

    /**
     * Sale payments ARE readable, and that is correct.
     *
     * page:sales.new is in READS.salePayments because the Sales entry screen takes
     * money against the sale it is creating - the payment and the sale are one
     * action. Somebody who can take an order can see what has been paid on orders.
     * Spelled out because it looks like a leak at a glance and is not one.
     */
    it("can read sale payments, because taking an order means taking payment", () => {
        assert.ok(holds(READS.salePayments));
    });

    it("cannot read sale payments without a sales or customer page", () => {
        // The Customer List shows what each customer has paid, so holding it does
        // grant this. Holding neither sales nor customers does not.
        const neither = ["page:dashboard.overview", "page:expenses.overview"];
        const flat: readonly string[] = READS.salePayments;
        assert.ok(!flat.some((name) => neither.includes(name)), "an unrelated page grants the payment history");
    });

    it("gets no read at all from holding only the Dashboard", () => {
        // The reason there is no dashboard-summary shortcut in the unions: nearly
        // every user holds this tick, so putting it in one would hand the whole
        // business's books to everybody.
        const onlyDashboard = ["page:dashboard.overview"];
        for (const [table, names] of Object.entries(READS)) {
            assert.ok(
                !names.some((name) => onlyDashboard.includes(name)),
                `the Dashboard alone grants ${table}`
            );
        }
    });
});
