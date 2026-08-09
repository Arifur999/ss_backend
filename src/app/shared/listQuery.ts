// Shared pieces for list endpoints that can page and search on the server.
//
// The browser currently does both, and its rules are JavaScript's. The two
// have to agree, so this is written to match what the frontend's
// queryEngine.ts does rather than what SQL would do on its own:
//
//   - a search is a plain case-insensitive "contains", NOT a LIKE pattern.
//     Typing "50%" must look for the three characters "50%", so the wildcards
//     are escaped. Prisma's `contains` passes the term straight into LIKE.
//   - asking for no limit returns everything, which is how every existing
//     caller already behaves. Paging is opt-in, so nothing changes for a page
//     that has not been moved over yet.

export interface ListOptions {
    page?: number;
    limit?: number;
    search?: string;
    // Inclusive date bounds, as YYYY-MM-DD. The browser asks for the range it
    // is about to display; without them a page showing one month still had to
    // download every row the account has ever had.
    from?: string;
    to?: string;
}

// LIKE treats % and _ as wildcards and \ as the escape character. A term the
// user typed has to be matched literally.
export const escapeLikeTerm = (term: string): string =>
    term.replace(/[\\%_]/g, (character) => `\\${character}`);

const positiveInt = (value: unknown): number | undefined => {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return undefined;
    return parsed;
};

// Reads page/limit/search off a request query. Anything unusable is ignored
// rather than rejected: a bad ?limit must not turn a working list into an
// error page.
// Only a plain YYYY-MM-DD is accepted. The date columns are @db.Date, and the
// frontend always sends this shape; anything else is ignored rather than
// guessed at, so a malformed param widens the range instead of breaking it.
const isoDate = (value: unknown): string | undefined => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return undefined;
    // JavaScript rolls impossible dates forward rather than rejecting them -
    // "2026-02-31" becomes 3 March. Comparing the round trip catches that, so a
    // typo drops the filter instead of quietly shifting the range.
    return parsed.toISOString().slice(0, 10) === value ? value : undefined;
};

export const parseListOptions = (query: Record<string, unknown>): ListOptions => {
    const search = typeof query.search === "string" ? query.search.trim() : "";
    return {
        page: positiveInt(query.page),
        limit: positiveInt(query.limit),
        search: search || undefined,
        from: isoDate(query.from),
        to: isoDate(query.to),
    };
};

// A Prisma filter for the given column, or undefined when neither bound was
// supplied - spread into a `where` so an absent range changes nothing:
//
//     where: { owner_id, ...dateRangeWhere(options) }
//
// Both bounds are inclusive, matching the browser's gte/lte.
export const dateRangeWhere = (options: ListOptions, column = "date"): Record<string, unknown> => {
    if (!options.from && !options.to) return {};
    return {
        [column]: {
            ...(options.from ? { gte: new Date(`${options.from}T00:00:00.000Z`) } : {}),
            ...(options.to ? { lte: new Date(`${options.to}T23:59:59.999Z`) } : {}),
        },
    };
};

// How many rows to skip, and how many to take. Undefined means "no paging" -
// the caller returns the whole list, exactly as before.
export const pageSlice = (options: ListOptions): { skip: number; take: number } | undefined => {
    if (!options.limit) return undefined;
    const page = options.page ?? 1;
    return { skip: (page - 1) * options.limit, take: options.limit };
};

export const paginationMeta = (options: ListOptions, total: number) => {
    const limit = options.limit ?? total;
    const page = options.page ?? 1;
    return {
        page,
        limit,
        total,
        totalPage: limit > 0 ? Math.ceil(total / limit) : 1,
    };
};
