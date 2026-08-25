import status from "http-status";
import { Role, SupportTicketStatus } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { cleanText, statusAfterMessage, subjectFrom } from "./supportRules.js";
import { ICreateTicketPayload, IReplyTicketPayload } from "./support.validation.js";

const messageSelect = {
    id: true,
    body: true,
    from_admin: true,
    author_name: true,
    created_at: true,
} as const;

// ---- The customer's side -------------------------------------------------

const createTicket = async (payload: ICreateTicketPayload, user: IRequestUser) => {
    const body = cleanText(payload.message);
    return prisma.supportTicket.create({
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
};

const getMyTickets = async (user: IRequestUser) => {
    return prisma.supportTicket.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { last_message_at: "desc" },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });
};

// ---- The platform's side -------------------------------------------------

const getAllTickets = async (statusFilter?: string) => {
    const wanted = String(statusFilter || "").trim();
    const isKnown = (Object.values(SupportTicketStatus) as string[]).includes(wanted);
    return prisma.supportTicket.findMany({
        where: isKnown ? { status: wanted as SupportTicketStatus } : {},
        // Oldest unanswered first would bury the rest; the inbox sorts by
        // status on the client and this keeps the newest conversation on top.
        orderBy: { last_message_at: "desc" },
        include: {
            messages: { select: messageSelect, orderBy: { created_at: "asc" } },
            owner: { select: { id: true, full_name: true, email: true, phone: true } },
        },
    });
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

    // The status follows whoever spoke last, which is what makes the inbox
    // count mean "waiting on us". A customer writing on a solved ticket
    // reopens it rather than being turned away.
    return prisma.supportTicket.update({
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
};

const markSolved = async (ticketId: string, user: IRequestUser) => {
    await ticketFor(ticketId, user);
    return prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: SupportTicketStatus.solved, solved_at: new Date(), solved_by: user.email },
        include: { messages: { select: messageSelect, orderBy: { created_at: "asc" } } },
    });
};

export const SupportService = {
    createTicket,
    getMyTickets,
    getAllTickets,
    replyToTicket,
    markSolved,
};
