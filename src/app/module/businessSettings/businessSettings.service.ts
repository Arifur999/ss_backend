import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IUpsertBusinessSettingsPayload } from "./businessSettings.validation.js";

const getBusinessSettings = async (user: IRequestUser) => {
    const settings = await prisma.businessSettings.findUnique({
        where: { owner_id: user.ownerId },
    });
    return settings;
};

const upsertBusinessSettings = async (payload: IUpsertBusinessSettingsPayload, user: IRequestUser) => {
    const settings = await prisma.businessSettings.upsert({
        where: { owner_id: user.ownerId },
        create: { ...payload, owner_id: user.ownerId },
        update: { ...payload },
    });
    return settings;
};

export const BusinessSettingsService = {
    getBusinessSettings,
    upsertBusinessSettings,
};
