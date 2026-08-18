import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERMISSIONS, sanitizePermissions } from "./permissions.js";

describe("sanitizePermissions", () => {
    it("keeps names this build knows about", () => {
        assert.deepEqual(sanitizePermissions(["Delete Sale", "View Sales"]), ["Delete Sale", "View Sales"]);
    });

    it("drops names it does not recognise rather than failing the save", () => {
        // A frontend from a slightly older deploy may still send a permission that
        // has since been removed. Dropping it is better than rejecting the whole
        // user, and better than storing a name nothing will ever check.
        assert.deepEqual(sanitizePermissions(["Delete Sale", "Backup", "Restore"]), ["Delete Sale"]);
    });

    it("removes duplicates", () => {
        assert.deepEqual(sanitizePermissions(["View Sales", "View Sales"]), ["View Sales"]);
    });

    it("returns an empty list for anything that is not an array of strings", () => {
        // Empty is meaningful: it is what every existing user has, and the
        // middleware reads it as "everything the role allows".
        assert.deepEqual(sanitizePermissions(undefined), []);
        assert.deepEqual(sanitizePermissions(null), []);
        assert.deepEqual(sanitizePermissions("Delete Sale"), []);
        assert.deepEqual(sanitizePermissions([1, 2, 3]), []);
        assert.deepEqual(sanitizePermissions([{ name: "Delete Sale" }]), []);
    });

    it("accepts every name in the canonical list", () => {
        assert.deepEqual(sanitizePermissions([...PERMISSIONS]), [...PERMISSIONS]);
    });

    it("has no duplicate names in the canonical list", () => {
        assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
    });

    it("names no feature that does not exist", () => {
        // The old Settings matrix advertised Backup, Restore, Stock Book,
        // Purchase Book and a few others. None of them are features this app has,
        // so granting them meant nothing and the checkbox was a promise it could
        // not keep.
        for (const gone of ["Backup", "Restore", "Stock Book", "Purchase Book", "Purchase Book Edit", "Cart Edit", "Quick Sale"]) {
            assert.equal(
                (PERMISSIONS as readonly string[]).includes(gone),
                false,
                `${gone} names a feature that does not exist`
            );
        }
    });
});
