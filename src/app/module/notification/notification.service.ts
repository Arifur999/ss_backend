import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateNotificationPayload } from "./notification.validation.js";

// ---- Super admin ----

const createNotification = async (payload: ICreateNotificationPayload, admin: IRequestUser) => {
    return prisma.adminNotification.create({
        data: {
            title: payload.title.trim(),
            message: payload.message.trim(),
            created_by: admin.email,
        },
    });
};

const getAllNotifications = async () => {
    const [items, readCounts] = await Promise.all([
        prisma.adminNotification.findMany({ orderBy: { created_at: "desc" } }),
        prisma.notificationRead.groupBy({ by: ["notification_id"], _count: { _all: true } }),
    ]);
    const readMap = new Map(readCounts.map((r) => [r.notification_id, r._count._all]));
    return items.map((n) => ({ ...n, read_count: readMap.get(n.id) ?? 0 }));
};

const deleteNotification = async (id: string) => {
    const existing = await prisma.adminNotification.findUnique({ where: { id } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Notification not found");
    await prisma.adminNotification.delete({ where: { id } }); // reads cascade
    return { id };
};

// ---- Any authenticated user ----

const getMyNotifications = async (user: IRequestUser) => {
    const [items, reads] = await Promise.all([
        prisma.adminNotification.findMany({ orderBy: { created_at: "desc" }, take: 100 }),
        prisma.notificationRead.findMany({ where: { user_id: user.userId }, select: { notification_id: true } }),
    ]);
    const readSet = new Set(reads.map((r) => r.notification_id));
    const list = items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        created_at: n.created_at,
        read: readSet.has(n.id),
    }));
    return { items: list, unread: list.filter((n) => !n.read).length };
};

const markAllRead = async (user: IRequestUser) => {
    const [items, reads] = await Promise.all([
        prisma.adminNotification.findMany({ select: { id: true } }),
        prisma.notificationRead.findMany({ where: { user_id: user.userId }, select: { notification_id: true } }),
    ]);
    const readSet = new Set(reads.map((r) => r.notification_id));
    const toInsert = items.filter((n) => !readSet.has(n.id)).map((n) => ({ notification_id: n.id, user_id: user.userId }));
    if (toInsert.length > 0) {
        await prisma.notificationRead.createMany({ data: toInsert, skipDuplicates: true });
    }
    return { marked: toInsert.length };
};

export const NotificationService = {
    createNotification,
    getAllNotifications,
    deleteNotification,
    getMyNotifications,
    markAllRead,
};
