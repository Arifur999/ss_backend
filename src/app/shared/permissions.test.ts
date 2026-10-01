import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    DELETE_PERMISSIONS,
    LEGACY_PERMISSIONS,
    PAGE_PERMISSIONS,
    PERMISSIONS,
    PERMISSION_FINGERPRINT,
    READS,
    describePermissions,
    permissionLabel,
    sanitizePermissions,
} from "./permissions.js";

const groupOf = (name: string) => name.slice(name.indexOf(":") + 1, name.lastIndexOf("."));

describe("sanitizePermissions", () => {
    it("keeps names this build knows about", () => {
        assert.deepEqual(
            sanitizePermissions(["page:sales.ledger", "page:sales.new"]),
            ["page:sales.ledger", "page:sales.new"]
        );
    });

    it("drops names it does not recognise rather than failing the save", () => {
        // A frontend from a slightly older deploy may still send a permission that
        // has since been removed. Dropping it is better than rejecting the whole
        // user, and better than storing a name nothing will ever check.
        assert.deepEqual(sanitizePermissions(["page:sales.ledger", "Backup", "Restore"]), ["page:sales.ledger"]);
    });

    it("removes duplicates", () => {
        assert.deepEqual(sanitizePermissions(["page:sales.ledger", "page:sales.ledger"]), ["page:sales.ledger"]);
    });

    it("returns an empty list for anything that is not an array of strings", () => {
        // Empty is meaningful: it is what every existing user has, and the
        // middleware reads it as "everything the role allows".
        assert.deepEqual(sanitizePermissions(undefined), []);
        assert.deepEqual(sanitizePermissions(null), []);
        assert.deepEqual(sanitizePermissions("page:sales.ledger"), []);
        assert.deepEqual(sanitizePermissions([1, 2, 3]), []);
        assert.deepEqual(sanitizePermissions([{ name: "page:sales.ledger" }]), []);
    });

    // requirePermission is any-of, so it cannot express "page AND delete". A
    // delete tick held alone would therefore grant API-level delete on a screen
    // the holder cannot even open. The UI disables the tick until a page in that
    // box is ticked; this is the same rule where it cannot be bypassed, so it
    // holds even for an array written with curl.
    it("drops a delete tick with no page from its own group", () => {
        assert.deepEqual(sanitizePermissions(["act:sales.delete"]), []);
        assert.deepEqual(sanitizePermissions(["page:customers.list", "act:sales.delete"]), ["page:customers.list"]);
    });

    it("keeps a delete tick that sits behind a page from the same group", () => {
        assert.deepEqual(
            sanitizePermissions(["page:sales.history", "act:sales.delete"]),
            ["page:sales.history", "act:sales.delete"]
        );
    });

    it("no longer accepts the old action-shaped vocabulary", () => {
        // Safe only because the stored data was translated first and verified
        // empty of old names. Doing this in the other order would have widened
        // every restricted user to their full role, silently.
        assert.deepEqual(sanitizePermissions(["View Sales", "Delete Purchase"]), []);
        assert.deepEqual(sanitizePermissions(["page:sales.ledger", "View Sales"]), ["page:sales.ledger"]);
    });
});

describe("the canonical list", () => {
    it("accepts every name in it", () => {
        assert.deepEqual(sanitizePermissions([...PAGE_PERMISSIONS]), [...PAGE_PERMISSIONS]);
    });

    it("has no duplicate names", () => {
        assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
    });

    /**
     * The lockstep check.
     *
     * The same literal is asserted in Hatim/src/lib/permissions.test.ts. The two
     * files live in separate repos with separate CI so nothing can compare them
     * at build time - this can. When it fails, look at the OTHER repo before you
     * edit the number.
     *
     * Computed over CURRENT_PERMISSIONS, not PERMISSIONS: the legacy tail is this
     * repo's transitional business and the frontend has never heard of it.
     */
    it("hashes to the value the frontend also asserts", () => {
        assert.equal(PERMISSION_FINGERPRINT, "59-2f1ec9b0");
        assert.equal(PAGE_PERMISSIONS.length, 50);
        assert.equal(DELETE_PERMISSIONS.length, 9);
        assert.equal(PERMISSIONS.length, 59);
    });

    it("gives every delete tick a page in its own group", () => {
        for (const name of DELETE_PERMISSIONS) {
            const siblings = PAGE_PERMISSIONS.filter((page) => groupOf(page) === groupOf(name));
            assert.ok(siblings.length > 0, `${name} has no page in its group`);
        }
    });

    it("prefixes every current name, so the two kinds can always be told apart", () => {
        for (const name of PAGE_PERMISSIONS) assert.ok(name.startsWith("page:"), name);
        for (const name of DELETE_PERMISSIONS) assert.ok(name.endsWith(".delete"), name);
    });

    it("names no feature that does not exist", () => {
        for (const gone of ["Backup", "Restore", "Stock Book", "Purchase Book", "Cart Edit", "Quick Sale"]) {
            assert.ok(!PERMISSIONS.includes(gone as never), gone);
        }
    });

    // LEGACY_PERMISSIONS survives as the input domain of legacyPermissionMap -
    // what documents what each old name became - but nothing may store one.
    it("keeps the old list as history and accepts none of it", () => {
        assert.equal(LEGACY_PERMISSIONS.length, 52);
        for (const legacy of LEGACY_PERMISSIONS) {
            assert.ok(!PERMISSIONS.includes(legacy as never), `${legacy} is still accepted`);
        }
        assert.deepEqual(sanitizePermissions([...LEGACY_PERMISSIONS]), []);
    });
});

describe("READS", () => {
    it("names only real page permissions", () => {
        for (const [table, names] of Object.entries(READS)) {
            for (const name of names) {
                assert.ok(PAGE_PERMISSIONS.includes(name), `READS.${table} names unknown "${name}"`);
            }
        }
    });

    it("has no duplicates inside a union", () => {
        // A duplicate is harmless to requirePermission but means somebody edited
        // one of these by hand and lost track of what is in it.
        for (const [table, names] of Object.entries(READS)) {
            assert.equal(new Set(names).size, names.length, `READS.${table} repeats a name`);
        }
    });

    it("never gates a read behind a delete tick", () => {
        for (const [table, names] of Object.entries(READS)) {
            for (const name of names) {
                assert.ok(!name.startsWith("act:"), `READS.${table} asks for the delete tick ${name}`);
            }
        }
    });

    /**
     * The Dashboard must NOT appear in any of these.
     *
     * Nearly every user holds page:dashboard.overview, so listing it in a read
     * union would hand every staff member raw GET /sales and GET /expenses - the
     * exact hole this work exists to close. The Dashboard gets its figures from
     * GET /reports/dashboard-summary, which aggregates server-side and omits the
     * blocks the caller may not see.
     */
    it("never grants a table read on the strength of the Dashboard alone", () => {
        for (const [table, names] of Object.entries(READS)) {
            const flat: readonly string[] = names;
            assert.ok(!flat.includes("page:dashboard.overview"), `READS.${table} includes the Dashboard`);
        }
    });
});

describe("permissionLabel", () => {
    it("names a page the way the Permissions screen does", () => {
        assert.equal(permissionLabel("page:sales.ledger"), "Sales - Ledger");
        assert.equal(permissionLabel("page:purchase.received"), "Purchase - Received");
        assert.equal(permissionLabel("page:customers.due-received"), "Customers - Due Received");
    });

    it("names a delete tick", () => {
        assert.equal(permissionLabel("act:sales.delete"), "Sales - delete");
    });

    it("hands back a legacy name untouched, so a 403 mid-window still reads", () => {
        assert.equal(permissionLabel("View Sales"), "View Sales");
    });

    it("spells a whole list for the 403, deduped", () => {
        assert.equal(
            describePermissions(["page:sales.ledger", "page:sales.history"]),
            "Sales - Ledger or Sales - History"
        );
        assert.equal(describePermissions(["act:sales.delete", "act:sales.delete"]), "Sales - delete");
    });
});
