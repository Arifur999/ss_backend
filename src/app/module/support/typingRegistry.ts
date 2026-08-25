/**
 * Who is typing on which ticket.
 *
 * Deliberately in memory, not in the database. Typing is true for a few
 * seconds and then it is not; writing it to Postgres would mean a row update
 * per keystroke-batch on a table that exists to hold a conversation. Losing
 * this on a restart costs nothing - the indicator simply stops, and the next
 * keystroke puts it back.
 *
 * The app runs as a single instance. If it is ever run behind more than one,
 * a customer and an admin served by different processes would not see each
 * other's indicator; the conversation itself is unaffected, because that lives
 * in the database.
 */

/** How long after the last keystroke somebody still counts as typing. */
export const TYPING_TTL_MS = 6000;

/** Entries older than this are dropped whenever the registry is written to. */
const PRUNE_AFTER_MS = 60_000;

type Side = "admin" | "customer";
type Entry = { admin?: number; customer?: number };

const typing = new Map<string, Entry>();

export const markTyping = (ticketId: string, side: Side, now = Date.now()): void => {
    const entry = typing.get(ticketId) ?? {};
    entry[side] = now;
    typing.set(ticketId, entry);
    prune(now);
};

/** Whether the OTHER side has typed recently enough to still be typing. */
export const isTyping = (ticketId: string, side: Side, now = Date.now()): boolean => {
    const at = typing.get(ticketId)?.[side];
    return at !== undefined && now - at < TYPING_TTL_MS;
};

/**
 * Somebody who has just sent their message is no longer typing. Without this
 * the bubble hangs around for the rest of the TTL underneath the message that
 * was being typed, which reads as a second message on the way.
 */
export const clearTyping = (ticketId: string, side: Side): void => {
    const entry = typing.get(ticketId);
    if (!entry) return;
    delete entry[side];
    if (entry.admin === undefined && entry.customer === undefined) typing.delete(ticketId);
};

function prune(now: number): void {
    for (const [id, entry] of typing) {
        const newest = Math.max(entry.admin ?? 0, entry.customer ?? 0);
        if (now - newest > PRUNE_AFTER_MS) typing.delete(id);
    }
}

/** Test seam: forget everything. */
export const resetTyping = (): void => typing.clear();
