import bcrypt from "bcryptjs";
import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateTeamUserPayload, IUpdateTeamUserPayload } from "./user.validation.js";

// Same shape the old manage-users edge function returned.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTeamUser = (user: any) => ({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    phone: user.phone,
    is_active: user.is_active,
    created_at: user.created_at,
});

const listTeamUsers = async (user: IRequestUser) => {
    const users = await prisma.user.findMany({
        where: {
            OR: [{ id: user.ownerId }, { owner_id: user.ownerId }],
        },
        orderBy: { created_at: "asc" },
    });

    return users.map(toTeamUser);
};

const createTeamUser = async (payload: ICreateTeamUserPayload, user: IRequestUser) => {
    const email = payload.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        throw new AppError(status.CONFLICT, "An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(payload.password, 10);

    const created = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            full_name: payload.full_name,
            role: payload.role,
            phone: payload.phone ?? "",
            owner_id: user.ownerId,
        },
    });

    return toTeamUser(created);
};

const updateTeamUser = async (payload: IUpdateTeamUserPayload, user: IRequestUser) => {
    const target = await prisma.user.findFirst({
        where: { id: payload.user_id, owner_id: user.ownerId },
    });

    if (!target) {
        throw new AppError(status.NOT_FOUND, "Team user not found");
    }

    if (target.id === user.userId) {
        throw new AppError(status.BAD_REQUEST, "Use profile settings to update your own account");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (payload.role !== undefined) data.role = payload.role;
    if (payload.full_name !== undefined) data.full_name = payload.full_name;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.is_active !== undefined) data.is_active = payload.is_active;
    if (payload.password !== undefined) data.password = await bcrypt.hash(payload.password, 10);

    const updated = await prisma.user.update({
        where: { id: target.id },
        data,
    });

    return toTeamUser(updated);
};

const deleteTeamUser = async (userId: string, user: IRequestUser) => {
    if (userId === user.userId) {
        throw new AppError(status.BAD_REQUEST, "Cannot delete your own account");
    }

    const target = await prisma.user.findFirst({
        where: { id: userId, owner_id: user.ownerId },
    });

    if (!target) {
        throw new AppError(status.NOT_FOUND, "Team user not found");
    }

    await prisma.user.delete({ where: { id: userId } });

    return { message: "Team user deleted successfully" };
};

export const UserService = {
    listTeamUsers,
    createTeamUser,
    updateTeamUser,
    deleteTeamUser,
};
