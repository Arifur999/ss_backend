import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { ICreateLeadPayload, IUpdateLeadPayload } from "./lead.validation.js";

const getAllLeads = async (user: IRequestUser) => {
    return prisma.lead.findMany({
        where: { owner_id: user.ownerId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
};

const createLead = async (payload: ICreateLeadPayload, user: IRequestUser) => {
    const phone = payload.phone.trim();

    // Two people can note down the same shop after the same trade fair. The
    // second one is told rather than left to create a duplicate nobody spots
    // until the campaign sends twice.
    const existing = await prisma.lead.findFirst({
        where: { owner_id: user.ownerId, phone },
        select: { organization: true },
    });
    if (existing) {
        throw new AppError(status.CONFLICT, `That number is already a lead (${existing.organization})`);
    }

    return prisma.lead.create({
        data: {
            owner_id: user.ownerId,
            date: new Date(payload.date),
            organization: payload.organization.trim(),
            designation: (payload.designation || "").trim(),
            name: payload.name.trim(),
            phone,
            address: payload.address.trim(),
            notes: (payload.notes || "").trim(),
            created_by: user.userId,
        },
    });
};

const updateLead = async (id: string, payload: IUpdateLeadPayload, user: IRequestUser) => {
    const existing = await prisma.lead.findFirst({ where: { id, owner_id: user.ownerId } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Lead not found");

    return prisma.lead.update({
        where: { id },
        data: {
            ...payload,
            ...(payload.date !== undefined ? { date: new Date(payload.date) } : {}),
        },
    });
};

const deleteLead = async (id: string, user: IRequestUser) => {
    const existing = await prisma.lead.findFirst({ where: { id, owner_id: user.ownerId } });
    if (!existing) throw new AppError(status.NOT_FOUND, "Lead not found");

    await prisma.lead.delete({ where: { id } });
    return { message: "Lead deleted successfully" };
};

export const LeadService = { getAllLeads, createLead, updateLead, deleteLead };
