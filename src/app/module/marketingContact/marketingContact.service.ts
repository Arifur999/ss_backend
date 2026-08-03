import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import {
    ICreateMarketingContactPayload,
    IUpdateMarketingContactPayload,
} from "./marketingContact.validation.js";

const getAllContacts = async (user: IRequestUser) => {
    return prisma.marketingContact.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { created_at: "asc" },
    });
};

const createContact = async (payload: ICreateMarketingContactPayload, user: IRequestUser) => {
    const phone = payload.phone.trim();

    // The composer already blocks duplicates it can see, but two devices can
    // add the same number at once - keep the list clean here too.
    const existing = await prisma.marketingContact.findFirst({
        where: { owner_id: user.ownerId, phone },
    });

    if (existing) {
        throw new AppError(status.CONFLICT, "That number is already in the contact list");
    }

    return prisma.marketingContact.create({
        data: {
            owner_id: user.ownerId,
            name: (payload.name || "").trim() || phone,
            phone,
            note: (payload.note || "").trim(),
        },
    });
};

const updateContact = async (
    id: string,
    payload: IUpdateMarketingContactPayload,
    user: IRequestUser
) => {
    const existing = await prisma.marketingContact.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Contact not found");
    }

    return prisma.marketingContact.update({
        where: { id },
        data: payload,
    });
};

const deleteContact = async (id: string, user: IRequestUser) => {
    const existing = await prisma.marketingContact.findFirst({
        where: { id, owner_id: user.ownerId },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Contact not found");
    }

    await prisma.marketingContact.delete({ where: { id } });

    return { message: "Contact deleted successfully" };
};

export const MarketingContactService = {
    getAllContacts,
    createContact,
    updateContact,
    deleteContact,
};
