import bcrypt from "bcryptjs";
import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { sanitizePermissions } from "../../shared/permissions.js";
import { invalidateUser } from "../../utils/authCache.js";
import { ICreateTeamUserPayload, IUpdateOwnProfilePayload, IUpdateTeamUserPayload } from "./user.validation.js";

// Same shape the old manage-users edge function returned.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTeamUser = (user: any) => ({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    phone: user.phone,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    permissions: user.permissions ?? [],
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
            avatar_url: payload.avatar_url ?? "",
            owner_id: user.ownerId,
            // Unknown names are dropped rather than rejected, so a frontend from
            // a slightly older deploy cannot fail the whole save. An empty list
            // means "everything the role allows" - see shared/permissions.ts.
            permissions: sanitizePermissions(payload.permissions),
            // Staff accounts are created by their owner who hands them the
            // password directly - no OTP round-trip needed for them.
            email_verified: true,
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
    if (payload.avatar_url !== undefined) data.avatar_url = payload.avatar_url;
    if (payload.is_active !== undefined) data.is_active = payload.is_active;
    if (payload.permissions !== undefined) data.permissions = sanitizePermissions(payload.permissions);
    if (payload.password !== undefined) {
        data.password = await bcrypt.hash(payload.password, 10);
        // An owner setting a new password for a staff member is usually doing it
        // to take access back. Retire whatever sessions that account already has.
        data.token_version = { increment: 1 };
    }

    const updated = await prisma.user.update({
        where: { id: target.id },
        data,
    });

    // Role, is_active and permissions are read from the cache on every request,
    // so a deactivated, demoted or newly-restricted user has to stop working now,
    // not in 15s.
    invalidateUser(target.id);

    return toTeamUser(updated);
};

// A person editing their own name, phone or photo. updateTeamUser refuses to
// touch the caller's own row on purpose - it is the route for managing staff -
// so this is the way an owner changes their own details.
const updateOwnProfile = async (payload: IUpdateOwnProfilePayload, user: IRequestUser) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (payload.full_name !== undefined) data.full_name = payload.full_name;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.avatar_url !== undefined) data.avatar_url = payload.avatar_url;

    const updated = await prisma.user.update({
        where: { id: user.userId },
        data,
    });

    // The name is read from the cache on every request, so it has to refresh
    // now rather than in fifteen seconds.
    invalidateUser(user.userId);

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
    invalidateUser(userId);

    return { message: "Team user deleted successfully" };
};

export const UserService = {
    listTeamUsers,
    createTeamUser,
    updateTeamUser,
    updateOwnProfile,
    deleteTeamUser,
};
