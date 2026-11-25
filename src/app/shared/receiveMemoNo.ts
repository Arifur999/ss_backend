// ---------------------------------------------------------------------------
// Numbering receive memos.
//
// Purchase orders let the client pick the number and the server suffix it on a
// collision (resolveSiNo). That works there because an operator types the
// number and expects to see the one they typed. A receive memo is never typed:
// it is handed out when the lorry is unloaded, and the only thing anyone asks
// of it is that no two memos share one and that today's follows yesterday's.
//
// So this one is decided on the server, from what is already in the book.
// ---------------------------------------------------------------------------

/** The month's prefix: RCV-2611- for November 2026. */
export function memoPrefix(date: Date): string {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `RCV-${yy}${mm}-`;
}

export const FIRST_MEMO_SEQ = 1001;

/**
 * The next memo number for this month, given the ones already issued.
 *
 * Only numbers carrying this month's prefix are looked at, so each month
 * restarts at 1001 and a number stays readable as "the 24th delivery of
 * November". Anything that does not parse - a hand-edited number, a legacy
 * row - is ignored rather than allowed to produce RCV-2611-NaN.
 */
export function nextMemoNo(existing: Iterable<string>, date: Date = new Date()): string {
    const prefix = memoPrefix(date);
    let highest = FIRST_MEMO_SEQ - 1;

    for (const value of existing) {
        if (typeof value !== "string" || !value.startsWith(prefix)) continue;
        const tail = value.slice(prefix.length);
        if (!/^\d+$/.test(tail)) continue;
        const seq = Number(tail);
        if (Number.isSafeInteger(seq) && seq > highest) highest = seq;
    }

    return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}
