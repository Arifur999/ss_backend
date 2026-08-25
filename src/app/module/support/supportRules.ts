import { SupportTicketStatus } from "../../../generated/prisma/enums.js";

/**
 * Where a ticket stands after somebody writes on it.
 *
 * The whole point of the status is to answer "is this waiting on us?", so it
 * follows who spoke last rather than being set by hand:
 *
 *   customer writes  -> open      (waiting on the platform)
 *   platform writes  -> answered  (waiting on the customer)
 *
 * A customer writing on a solved ticket reopens it. The alternative - refusing
 * the message - would push somebody whose problem came back to open a second
 * ticket that reads like a new one, and the history that made the first one
 * worth having would be split across two rows.
 */
export const statusAfterMessage = (fromAdmin: boolean): SupportTicketStatus =>
    fromAdmin ? SupportTicketStatus.answered : SupportTicketStatus.open;

/** Only the platform closes a ticket, so "solved" always means somebody looked. */
export const canMarkSolved = (role: string): boolean => role === "super_admin";

/**
 * Whether a ticket is still owed an answer. Used for the inbox count, so a
 * ticket the customer has come back on is counted again.
 */
export const isAwaitingReply = (status: SupportTicketStatus): boolean =>
    status === SupportTicketStatus.open;

/** Trimmed, and empty only when there was nothing but whitespace. */
export const cleanText = (value: unknown): string => String(value ?? "").trim();

/**
 * A subject for a ticket opened without one: the first line of the message,
 * shortened. An inbox listing rows called "(no subject)" is unreadable, and
 * asking twice for what the message already says is a form nobody enjoys.
 */
export const subjectFrom = (subject: unknown, body: unknown, limit = 80): string => {
    const given = cleanText(subject);
    if (given) return given.length > limit ? `${given.slice(0, limit - 1)}\u2026` : given;
    const firstLine = cleanText(body).split("\n")[0] ?? "";
    if (!firstLine) return "Support request";
    return firstLine.length > limit ? `${firstLine.slice(0, limit - 1)}\u2026` : firstLine;
};
