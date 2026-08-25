import { Response } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";

/**
 * Server-sent events for support conversations.
 *
 * Polling was the first attempt and it was the wrong shape: a four-second gap
 * is fine for "has anything changed today" and useless for a chat, where a
 * typing indicator that lands after the message it was meant to precede is
 * worse than none at all. This pushes instead - a reply is on the other screen
 * as fast as the network carries it.
 *
 * SSE rather than WebSocket because the traffic only ever goes one way. The
 * client already POSTs its messages and its keystrokes over the same session
 * cookie; all it lacks is a way to be told. EventSource brings reconnection
 * with it, needs no library on either side, and rides the existing HTTP stack
 * rather than asking nginx for a protocol upgrade.
 *
 * Held in memory, like the typing marks. A restart drops every stream and every
 * browser reconnects on its own a second later.
 */

type Client = {
    id: number;
    res: Response;
    /** Which workspace this viewer belongs to. Admins see every workspace. */
    ownerId: string;
    isAdmin: boolean;
};

const clients = new Map<number, Client>();
let nextId = 1;

/** Proxies close a connection that says nothing. A comment keeps it open and is ignored by EventSource. */
const HEARTBEAT_MS = 25_000;

export const subscribe = (res: Response, user: IRequestUser): (() => void) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Belt and braces for proxies that buffer by default; nginx is also
        // told to leave this path alone (see nginx.conf).
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const id = nextId++;
    const client: Client = { id, res, ownerId: user.ownerId, isAdmin: user.role === Role.super_admin };
    clients.set(id, client);

    // Tell the client it is connected, so it can stop showing "reconnecting".
    write(client, "ready", { ok: true });

    const beat = setInterval(() => {
        try {
            res.write(": ping\n\n");
        } catch {
            close();
        }
    }, HEARTBEAT_MS);

    const close = () => {
        clearInterval(beat);
        clients.delete(id);
    };
    res.on("close", close);
    return close;
};

function write(client: Client, event: string, payload: unknown): void {
    try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
        // A dead socket that has not fired "close" yet. Dropping it here keeps
        // one broken client from being written to on every publish.
        clients.delete(client.id);
    }
}

/**
 * Send to everyone entitled to see this ticket: the workspace it belongs to,
 * and every admin. The ownerId check is what stops one workspace's
 * conversation reaching another's screen.
 */
export const publish = (ownerId: string, event: string, payload: unknown): void => {
    for (const client of clients.values()) {
        if (client.isAdmin || client.ownerId === ownerId) write(client, event, payload);
    }
};

/** Admins only - a new ticket carries the customer's details with it. */
export const publishToAdmins = (event: string, payload: unknown): void => {
    for (const client of clients.values()) {
        if (client.isAdmin) write(client, event, payload);
    }
};

/** Test seam and a number worth having when something looks wrong in production. */
export const connectionCount = (): number => clients.size;
