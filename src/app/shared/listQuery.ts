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
export const parseListOptions = (query: Record<string, unknown>): ListOptions => {
    const search = typeof query.search === "string" ? query.search.trim() : "";
    return {
        page: positiveInt(query.page),
        limit: positiveInt(query.limit),
        search: search || undefined,
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
