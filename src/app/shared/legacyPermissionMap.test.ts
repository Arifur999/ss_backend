import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALWAYS_GRANTED, LEGACY_MAP, migratePermissionList, needsMigration } from "./legacyPermissionMap.js";
import { PERMISSIONS, LEGACY_PERMISSIONS } from "./permissions.js";

describe("the legacy map itself", () => {
    it("covers every old name, so nothing falls through unnoticed", () => {
        // A name missing from the table translates to nothing at all. If that is
        // the intent it belongs in the table as an empty array, with a reason in
        // the comment - not left out.
        for (const legacy of LEGACY_PERMISSIONS) {
            assert.ok(legacy in LEGACY_MAP, `${legacy} has no entry in LEGACY_MAP`);
        }
    });

    it("maps only onto names that exist today", () => {
        for (const [legacy, names] of Object.entries(LEGACY_MAP)) {
            for (const name of names) {
                assert.ok(PERMISSIONS.includes(name as never), `${legacy} maps onto unknown "${name}"`);
            }
        }
    });

    it("turns each Delete into exactly its group's tick, or nothing", () => {
        for (const [legacy, names] of Object.entries(LEGACY_MAP)) {
            if (!legacy.startsWith("Delete")) continue;
            assert.ok(names.length <= 1, `${legacy} maps onto several names`);
            for (const name of names) assert.ok(name.startsWith("act:"), `${legacy} maps onto a page`);
        }
    });

    it("never turns a read-only name into a delete tick", () => {
        // The one direction that would be an escalation rather than a translation.
        for (const [legacy, names] of Object.entries(LEGACY_MAP)) {
            if (legacy.startsWith("Delete")) continue;
            for (const name of names) {
                assert.ok(!name.startsWith("act:"), `${legacy} would grant ${name}`);
            }
        }
    });
});

describe("needsMigration", () => {
    it("says yes to an untranslated list", () => {
        assert.equal(needsMigration(["View Sales", "New Sale"]), true);
    });

    it("says no to a list already in the new vocabulary", () => {
        // Idempotence. The script has to be safe to run twice, because the first
        // run will be a dry run.
        assert.equal(needsMigration(["page:sales.ledger"]), false);
        assert.equal(needsMigration(["page:sales.ledger", "act:sales.delete"]), false);
    });

    it("says no to an empty list", () => {
        // Empty means "everything the role allows". Filling it in would take
        // access away from nearly every user in the system.
        assert.equal(needsMigration([]), false);
    });

    it("says no to a list of names it has never heard of", () => {
        assert.equal(needsMigration(["Backup", "Whatever"]), false);
    });
});

describe("migratePermissionList", () => {
    it("leaves an empty list empty", () => {
        assert.deepEqual(migratePermissionList([]), []);
    });

    it("always grants the Dashboard, because everybody could open it before", () => {
        assert.ok(migratePermissionList(["View Sales"]).includes(ALWAYS_GRANTED));
    });

    it("expands an area trio onto that area's pages", () => {
        const out = migratePermissionList(["View Customer", "Add Customer", "Edit Customer"]);
        assert.deepEqual(out, [ALWAYS_GRANTED, "page:customers.dashboard", "page:customers.list"]);
    });

    it("carries a delete across when its page came too", () => {
        const out = migratePermissionList(["View Sales", "Delete Sale"]);
        assert.ok(out.includes("act:sales.delete"));
        assert.ok(out.includes("page:sales.ledger"));
    });

    /**
     * The orphan rule, end to end.
     *
     * "Delete Sale" on its own is a real state in the old data: it was ticked
     * without "View Sales" because the old table gated the sidebar, not the
     * pages. Translating it literally would store act:sales.delete with no sales
     * page - which the server refuses, so it would be silently dropped on the
     * next save. Better to trim it here, where the printed diff shows it.
     */
    it("drops a delete that arrives with no page from its group", () => {
        assert.deepEqual(migratePermissionList(["Delete Sale"]), [ALWAYS_GRANTED]);
    });

    it("keeps a name already in the new vocabulary, so a re-run changes nothing", () => {
        const once = migratePermissionList(["View Sales", "Delete Sale"]);
        const twice = migratePermissionList(once);
        assert.deepEqual(twice, once);
    });

    it("drops the four names that were enforced nowhere", () => {
        // No route ever asked for these, so unticking one never stopped anybody
        // doing anything. Carrying them forward would invent a restriction.
        const out = migratePermissionList(["Discount", "Business Settings", "User Management", "Marketing SMS", "Recycle Bin"]);
        assert.deepEqual(out, [ALWAYS_GRANTED, "page:marketing.campaign", "page:marketing.buy-sms"]);
    });

    it("returns names in menu order, so a printed diff can be read", () => {
        const out = migratePermissionList(["View Reports", "View Sales", "View Balance"]);
        assert.deepEqual(out, [
            ALWAYS_GRANTED,
            "page:balance.overview", "page:balance.ledger", "page:balance.wallet",
            "page:sales.ledger", "page:sales.history",
            "page:reports.summary", "page:reports.yearly", "page:reports.monthly-target", "page:reports.purchase-target",
        ]);
    });

    it("keeps reading a balance separate from moving money between accounts", () => {
        // The old vocabulary had two ticks here and POST /account-transfers needed
        // the second one. Collapsing them would hand the transfer screen to
        // everybody who could merely look.
        assert.ok(!migratePermissionList(["View Balance"]).includes("page:balance.transfer"));
        assert.ok(migratePermissionList(["Account Transfer"]).includes("page:balance.transfer"));
    });

    it("never invents a name the server would refuse to store", () => {
        for (const legacy of LEGACY_PERMISSIONS) {
            for (const name of migratePermissionList([legacy])) {
                assert.ok(PERMISSIONS.includes(name as never), `${legacy} produced unknown "${name}"`);
            }
        }
    });

    it("translates a whole sales_staff-shaped grant the way the old template meant it", () => {
        const out = migratePermissionList(["View Sales", "New Sale", "Discount", "View Customer", "Add Customer", "Edit Customer", "View Due", "Add Due", "Product List"]);
        assert.deepEqual(out, [
            ALWAYS_GRANTED,
            "page:products.list",
            "page:sales.new", "page:sales.drafts", "page:sales.ledger", "page:sales.history",
            "page:customers.dashboard", "page:customers.list", "page:customers.due-received", "page:customers.ledger",
        ]);
    });
});
