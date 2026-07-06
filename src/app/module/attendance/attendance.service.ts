import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IUpsertAttendancePayload } from "./attendance.validation.js";

const getAllAttendance = async (user: IRequestUser, filters: { employee_id?: string; from?: string; to?: string }) => {
    return prisma.attendance.findMany({
        where: {
            owner_id: user.ownerId,
            ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
            ...(filters.from || filters.to
                ? {
                    date: {
                        ...(filters.from ? { gte: new Date(filters.from) } : {}),
                        ...(filters.to ? { lte: new Date(filters.to) } : {}),
                    },
                }
                : {}),
        },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

// One attendance row per employee per day (matches how the old page saved).
const upsertAttendance = async (payload: IUpsertAttendancePayload, user: IRequestUser) => {
    const employee = await prisma.employee.findFirst({
        where: { id: payload.employee_id, owner_id: user.ownerId },
    });

    if (!employee) {
        throw new AppError(status.NOT_FOUND, "Employee not found");
    }

    const date = new Date(payload.date);

    const existing = await prisma.attendance.findFirst({
        where: { owner_id: user.ownerId, employee_id: payload.employee_id, date },
    });

    if (existing) {
        return prisma.attendance.update({
            where: { id: existing.id },
            data: {
                present: payload.present,
                start_time: payload.start_time,
                end_time: payload.end_time,
                total_hours: payload.total_hours,
                notes: payload.notes,
            },
        });
    }

    return prisma.attendance.create({
        data: {
            owner_id: user.ownerId,
            employee_id: payload.employee_id,
            date,
            present: payload.present ?? true,
            start_time: payload.start_time,
            end_time: payload.end_time,
            total_hours: payload.total_hours,
            notes: payload.notes,
        },
    });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateAttendance = async (id: string, payload: Record<string, any>, user: IRequestUser) => {
    const existing = await prisma.attendance.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Attendance record not found");
    }

    const allowedFields = ["present", "start_time", "end_time", "total_hours", "notes", "date"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    for (const field of allowedFields) {
        if (field in payload) {
            data[field] = field === "date" && payload.date ? new Date(payload.date) : payload[field];
        }
    }

    return prisma.attendance.update({
        where: { id },
        data,
    });
};

const deleteAttendance = async (id: string, user: IRequestUser) => {
    const existing = await prisma.attendance.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Attendance record not found");
    }

    await prisma.attendance.delete({ where: { id } });

    return { message: "Attendance record deleted successfully" };
};

export const AttendanceService = {
    getAllAttendance,
    upsertAttendance,
    updateAttendance,
    deleteAttendance,
};
