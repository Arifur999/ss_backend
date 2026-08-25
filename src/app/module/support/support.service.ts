import status from "http-status";
import { Role, SupportTicketStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { cleanText, statusAfterMessage, subjectFrom } from "./supportRules.js";
import { clearTyping, isTyping, markTyping } from "./typingRegistry.js";
import { publish, publishToAdmins } from "./supportStream.js";
import { ICreateTicketPayload, IReplyTicketPayload } from "./support.validation.js";

const messageSelect = {
    id: true,
    body: true,
    from_admin: true,
    author_name: true,
    created_at: true,
} as const;


/**
 * Tags each ticket with whether the other side is typing right now. It rides
 * along on the list the client already polls, so watching for a reply and
 * watching for the bubble cost one request between them rather than two.
 */
const tagTyping = <T extends { id: string }>(tickets: T[], viewer: "admin" | "customer") =>
    tickets.map((ticket) => ({
        ...ticket,
        other_typing: isTyping(ticket.id, viewer === "admin" ? "customer" : "admin"),
    }));

// ---- The customer's side -------------------------------------------------

const createTicket = async (payload: ICreateTicketPayload, user: IRequestUser) => {
    const body = cleanText(payload.message);
    const ticket = await prisma.supportTicket.create({
        data: {
            owner_id: user.ownerId,
            opened_by: user.userId,
            subject: subjectFrom(payload.subject, body),
            status: SupportTicketStatus.open,
            last_message_at: new Date(),
            messages: {
                create: { body, from_admin: false, author_id: user.userId, author_name: user.name || user.email },
            },
        },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });

    // Admins hold no copy of a ticket that did not exist a moment ago, so they
    // get the whole row - with the customer attached, which is who is asking.
    const owner = await prisma.user.findUnique({
        where: { id: user.ownerId },
        select: { id: true, full_name: true, email: true, phone: true },
    });
    publishToAdmins("ticket:new", { ...ticket, owner });
    return ticket;
};

const getMyTickets = async (user: IRequestUser) => {
    const rows = await prisma.supportTicket.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { last_message_at: "desc" },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });
    return tagTyping(rows, "customer");
};

// ---- The platform's side -------------------------------------------------

const getAllTickets = async (statusFilter?: string) => {
    const wanted = String(statusFilter || "").trim();
    const isKnown = (Object.values(SupportTicketStatus) as string[]).includes(wanted);
    const rows = await prisma.supportTicket.findMany({
        where: isKnown ? { status: wanted as SupportTicketStatus } : {},
        // Oldest unanswered first would bury the rest; the inbox sorts by
        // status on the client and this keeps the newest conversation on top.
        orderBy: { last_message_at: "desc" },
        include: {
            messages: { select: messageSelect, orderBy: { created_at: "asc" } },
            owner: { select: { id: true, full_name: true, email: true, phone: true } },
        },
    });
    return tagTyping(rows, "admin");
};

// ---- Both sides ----------------------------------------------------------

/**
 * A ticket the caller is allowed to touch: their own workspace's, or any of
 * them if they are the platform. Everything below goes through this, so no
 * route can be talked into reading another workspace's conversation.
 */
const ticketFor = async (ticketId: string, user: IRequestUser) => {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError(status.NOT_FOUND, "Ticket not found");
    if (user.role !== Role.super_admin && ticket.owner_id !== user.ownerId) {
        // Not FORBIDDEN: that would confirm the ticket exists to somebody who
        // has no business knowing it does.
        throw new AppError(status.NOT_FOUND, "Ticket not found");
    }
    return ticket;
};

const replyToTicket = async (ticketId: string, payload: IReplyTicketPayload, user: IRequestUser) => {
    await ticketFor(ticketId, user);
    const fromAdmin = user.role === Role.super_admin;
    const now = new Date();
    // Whoever just sent is no longer typing; leaving it set hangs the bubble
    // under the message that was being written, reading as a second one coming.
    clearTyping(ticketId, fromAdmin ? "admin" : "customer");

    // The status follows whoever spoke last, which is what makes the inbox
    // count mean "waiting on us". A customer writing on a solved ticket
    // reopens it rather than being turned away.
    const updated = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
            status: statusAfterMessage(fromAdmin),
            last_message_at: now,
            ...(fromAdmin ? {} : { solved_at: null, solved_by: null }),
            messages: {
                create: {
                    body: cleanText(payload.message),
                    from_admin: fromAdmin,
                    author_id: user.userId,
                    author_name: user.name || user.email,
                },
            },
        },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });

    // Only what changed: both sides already hold the conversation, and the new
    // message is the one thing they do not.
    publish(updated.owner_id, "ticket:update", {
        id: updated.id,
        status: updated.status,
        last_message_at: updated.last_message_at,
        solved_at: updated.solved_at,
        solved_by: updated.solved_by,
        message: updated.messages[updated.messages.length - 1],
    });
    return updated;
};

const markSolved = async (ticketId: string, user: IRequestUser) => {
    await ticketFor(ticketId, user);
    const solved = await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: SupportTicketStatus.solved, solved_at: new Date(), solved_by: user.email },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });
    publish(solved.owner_id, "ticket:update", {
        id: solved.id,
        status: solved.status,
        last_message_at: solved.last_message_at,
        solved_at: solved.solved_at,
        solved_by: solved.solved_by,
    });
    return solved;
};

/** A keystroke heartbeat. Costs nothing to store and nothing to lose. */
const noteTyping = async (ticketId: string, user: IRequestUser) => {
    const ticket = await ticketFor(ticketId, user);
    const side = user.role === Role.super_admin ? "admin" : "customer";
    markTyping(ticketId, side);
    // Pushed, not polled: a bubble that arrives after the message it was meant
    // to precede is worse than no bubble at all.
    publish(ticket.owner_id, "ticket:typing", { id: ticketId, from: side });
    return { ok: true };
};

export const SupportService = {
    createTicket,
    getMyTickets,
    noteTyping,
    getAllTickets,
    replyToTicket,
    markSolved,
};
