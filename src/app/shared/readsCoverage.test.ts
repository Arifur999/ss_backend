import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { READS } from "./permissions.js";

// ---------------------------------------------------------------------------
// Does every page hold a permission for every gated table it reads?
//
// This is the quietest way the permission work could go wrong, and it is not
// hypothetical: the first pass left 34 of these. A page whose own permission is
// absent from a READS union gets a 403, the shim turns that into an empty array,
// and the page renders - with a total computed over nothing. "Balance: Tk 0" is
// not an incomplete answer, it is a confident wrong one.
//
// The frontend is a separate repo, so this can only run where both are checked
// out side by side. That is a developer's machine, which is where the mistake
// gets made, so it is worth having even though CI will skip it.
// ---------------------------------------------------------------------------

const FRONTEND = path.resolve(import.meta.dirname, "../../../../Hatim/src");
const available = existsSync(path.join(FRONTEND, "lib/permissions.ts"));

/**
 * The Dashboard is deliberately absent from every union.
 *
 * Nearly every user holds it, so granting a table read on its strength would
 * hand the whole business's books to everybody - the exact hole this work
 * closed. Dashboard.tsx collects the refusals instead and shows an em dash and
 * one banner for the figures it cannot compute. See its `denied` field.
 */
const BY_DESIGN = "page:dashboard.overview";

/** Shim table name -> the READS union that gates it. null = ungated by rule R3/R7. */
const TABLE_TO_READS: Record<string, keyof typeof READS | null> = {
    accounts: "accounts", account_transfers: "accountTransfers", inventory: "inventory",
    products: "products", product_price_updates: "priceUpdates", sale_payments: "salePayments",
    sales: "sales", purchases: "purchases", suppliers: "suppliers", customers: "customers",
    customer_payments: "customerPayments", expenses: "expenses", supplier_payments: "supplierPayments",
    other_incomes: "otherIncomes", shareholders: "shareholders", investments: "shareholders",
    profit_withdrawals: "shareholders", loans: "loans", loan_lenders: "loans",
    employees: "employees", salary_transactions: "salaryTransactions",
    monthly_targets: "targets", purchase_targets: "targets", damage_entries: "damage",
    marketing_contacts: "marketing",
};

function gaps(): string[] {
    const app = readFileSync(path.join(FRONTEND, "App.tsx"), "utf8");
    const fePerms = readFileSync(path.join(FRONTEND, "lib/permissions.ts"), "utf8");

    const accessBlock = fePerms.split("export const ROUTE_ACCESS: Record<string, Access> = {")[1].split("\n}")[0];
    const routeAccess = new Map<string, string>();
    for (const m of accessBlock.matchAll(/^\s*'([^']+)':\s*'([^']+)',/gm)) routeAccess.set(m[1], m[2]);

    const componentFile = new Map<string, string>();
    for (const m of app.matchAll(/const (\w+) = lazyWithReload\(\(\) => import\('\.\/([^']+)'\)\)/g)) componentFile.set(m[1], m[2]);
    for (const m of app.matchAll(/^import (\w+) from '\.\/(pages\/[^']+)'/gm)) componentFile.set(m[1], m[2]);

    const routeComponent = new Map<string, string>([["/", "Dashboard"]]);
    for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)\s*\/>\}/g)) routeComponent.set(m[1], m[2]);

    const out: string[] = [];
    for (const [route, access] of routeAccess) {
        if (!access.startsWith("page:") || access === BY_DESIGN) continue;
        const component = routeComponent.get(route);
        const relative = component ? componentFile.get(component) : undefined;
        if (!relative) continue;
        const file = path.join(FRONTEND, relative.replace(/^src\//, "") + (relative.endsWith(".tsx") ? "" : ".tsx"));
        if (!existsSync(file)) continue;

        const source = readFileSync(file, "utf8");
        const tables = new Set([...source.matchAll(/from\('([a-z_]+)'\)/g)].map((m) => m[1]));
        for (const table of tables) {
            const key = TABLE_TO_READS[table];
            if (!key) continue;
            const names: readonly string[] = READS[key];
            if (!names.includes(access)) {
                out.push(`${route} (${access}) reads ${table} but is not in READS.${key}`);
            }
        }
    }
    return out;
}

describe("every page can read what it displays", { skip: !available && "frontend repo not checked out beside this one" }, () => {
    it("finds the frontend to check against", () => {
        assert.ok(existsSync(path.join(FRONTEND, "App.tsx")), "App.tsx not found - the path above has moved");
    });

    it("leaves no page reading a table its own permission does not grant", () => {
        const found = gaps();
        assert.deepEqual(
            found,
            [],
            `\n${found.length} page(s) would render an empty section and a total computed over nothing:\n  ` +
            found.join("\n  ") + "\n"
        );
    });

    it("still keeps the Dashboard out of every union", () => {
        // Belt and braces with permissions.test.ts: if somebody "fixes" the
        // Dashboard's seven gaps by adding it to the unions, that is the hole
        // reopening, not a bug being closed.
        for (const [table, names] of Object.entries(READS)) {
            const flat: readonly string[] = names;
            assert.ok(!flat.includes(BY_DESIGN), `READS.${table} grants the Dashboard a raw table read`);
        }
    });
});
