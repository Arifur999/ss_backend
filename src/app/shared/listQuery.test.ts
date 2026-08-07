import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeLikeTerm, pageSlice, paginationMeta, parseListOptions } from "./listQuery.js";

// The frontend's queryEngine.test.ts pins down what a search means in the
// browser. These pin down the server half, and the pair have to agree - a
// search that quietly behaves like a SQL pattern would change which rows a
// page shows without anyone touching the page.

describe("escapeLikeTerm", () => {
    it("escapes the LIKE wildcards so a term is matched literally", () => {
        assert.equal(escapeLikeTerm("50%"), "50\\%");
        assert.equal(escapeLikeTerm("a_b"), "a\\_b");
        assert.equal(escapeLikeTerm("100%_off"), "100\\%\\_off");
    });

    it("escapes the escape character itself", () => {
        assert.equal(escapeLikeTerm("back\\slash"), "back\\\\slash");
    });

    it("leaves an ordinary term alone", () => {
        assert.equal(escapeLikeTerm("Wooden Chair"), "Wooden Chair");
        assert.equal(escapeLikeTerm("HWWD-301"), "HWWD-301");
    });

    it("leaves non-ASCII text alone", () => {
        assert.equal(escapeLikeTerm("কাঠের চেয়ার"), "কাঠের চেয়ার");
    });
});

describe("parseListOptions", () => {
    it("reads page, limit and search", () => {
        assert.deepEqual(parseListOptions({ page: "2", limit: "50", search: " chair " }), {
            page: 2,
            limit: 50,
            search: "chair",
        });
    });

    it("ignores anything unusable rather than failing the request", () => {
        assert.deepEqual(parseListOptions({ page: "0", limit: "-5", search: "   " }), {
            page: undefined,
            limit: undefined,
            search: undefined,
        });
        assert.deepEqual(parseListOptions({ page: "abc", limit: "1.5" }), {
            page: undefined,
            limit: undefined,
            search: undefined,
        });
    });

    it("treats an absent query as no paging and no search", () => {
        assert.deepEqual(parseListOptions({}), { page: undefined, limit: undefined, search: undefined });
    });
});

describe("pageSlice", () => {
    it("is undefined without a limit, so the caller returns everything", () => {
        assert.equal(pageSlice({}), undefined);
        assert.equal(pageSlice({ page: 3 }), undefined);
    });

    it("skips whole pages", () => {
        assert.deepEqual(pageSlice({ limit: 50 }), { skip: 0, take: 50 });
        assert.deepEqual(pageSlice({ page: 1, limit: 50 }), { skip: 0, take: 50 });
        assert.deepEqual(pageSlice({ page: 2, limit: 50 }), { skip: 50, take: 50 });
        assert.deepEqual(pageSlice({ page: 4, limit: 25 }), { skip: 75, take: 25 });
    });
});

describe("paginationMeta", () => {
    it("reports the page count", () => {
        assert.deepEqual(paginationMeta({ page: 1, limit: 50 }, 3500), {
            page: 1,
            limit: 50,
            total: 3500,
            totalPage: 70,
        });
    });

    it("rounds a partial last page up", () => {
        assert.equal(paginationMeta({ page: 1, limit: 50 }, 3501).totalPage, 71);
    });

    it("without paging, the whole list is one page", () => {
        assert.deepEqual(paginationMeta({}, 120), { page: 1, limit: 120, total: 120, totalPage: 1 });
    });

    it("an empty list is still one page, not zero or a division by zero", () => {
        assert.equal(paginationMeta({}, 0).totalPage, 1);
        assert.equal(paginationMeta({ page: 1, limit: 50 }, 0).totalPage, 0);
    });
});
