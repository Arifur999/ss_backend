import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { needsSupplier, nextDamageStatus, returnsStock } from "./damageStatus.js";

describe("nextDamageStatus", () => {
    test("nothing back yet is pending", () => {
        assert.equal(nextDamageStatus([{ qty: 2, received_qty: 0 }]), "pending");
    });

    test("some back is partial", () => {
        assert.equal(nextDamageStatus([{ qty: 3, received_qty: 1 }]), "partial");
    });

    test("all back is completed", () => {
        assert.equal(nextDamageStatus([{ qty: 3, received_qty: 3 }]), "completed");
    });

    test("one line short keeps the whole entry partial", () => {
        assert.equal(nextDamageStatus([
            { qty: 2, received_qty: 2 },
            { qty: 5, received_qty: 1 },
        ]), "partial");
    });

    test("one line started is enough to leave pending behind", () => {
        assert.equal(nextDamageStatus([
            { qty: 2, received_qty: 0 },
            { qty: 5, received_qty: 1 },
        ]), "partial");
    });

    test("over-receiving still counts as completed rather than sticking at partial", () => {
        // received_qty should never exceed qty, but a status that could never
        // reach completed would strand the entry on the Receive page forever.
        assert.equal(nextDamageStatus([{ qty: 2, received_qty: 3 }]), "completed");
    });

    // A half-made entry must stay visible to the Receive page. Calling it
    // finished because there is nothing outstanding would hide it.
    test("an entry with no lines is pending, not completed", () => {
        assert.equal(nextDamageStatus([]), "pending");
    });

    test("reads Prisma's strings and nulls without lying about them", () => {
        assert.equal(nextDamageStatus([{ qty: "4", received_qty: "4" }]), "completed");
        assert.equal(nextDamageStatus([{ qty: 4, received_qty: null }]), "pending");
    });
});

describe("returnsStock", () => {
    test("repaired and replaced go back on the shelf", () => {
        assert.equal(returnsStock("repaired"), true);
        assert.equal(returnsStock("replaced"), true);
    });

    // The one that matters: a piece can physically come back and still be
    // unsellable. Adding it to available_qty would put it in a FIFO batch, and
    // a later sale would be costed against goods that cannot be delivered.
    test("scrapped does not", () => {
        assert.equal(returnsStock("scrapped"), false);
    });
});

describe("needsSupplier", () => {
    test("goods that arrived broken came from somebody", () => {
        assert.equal(needsSupplier("supplier", "repair"), true);
    });

    test("returning or exchanging is going back to somebody", () => {
        assert.equal(needsSupplier("own_stock", "return"), true);
        assert.equal(needsSupplier("own_stock", "exchange"), true);
    });

    // The one case that must stay free: a chair broken in the showroom goes to
    // a local carpenter, who is not a supplier. Demanding one would have the
    // operator inventing a supplier to get past the form.
    test("own-stock repair needs nobody", () => {
        assert.equal(needsSupplier("own_stock", "repair"), false);
    });

    test("every combination is decided, none left to chance", () => {
        const sources = ["own_stock", "supplier"] as const;
        const actions = ["repair", "return", "exchange"] as const;
        const decided = sources.flatMap(source => actions.map(action => needsSupplier(source, action)));
        assert.equal(decided.length, 6);
        assert.equal(decided.filter(Boolean).length, 5);
    });
});
