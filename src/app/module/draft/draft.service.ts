import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IDraftKind, ISaveDraftPayload } from "./draft.validation.js";

// Who parked it, resolved for the list so a shop can see whose order to finish.
const draftSelect = {
    id: true,
    kind: true,
    title: true,
    subtitle: true,
    amount: true,
    data: true,
    created_by: true,
    created_at: true,
    updated_at: true,
} as const;

/**
 * Every draft in this workspace, newest first.
 *
 * Scoped by owner_id and NOT by created_by, deliberately: one person starts an
 * order, another finishes it, and the owner sees the lot. A draft only anybody
 * could see would be lost the moment its author went home.
 */
const listDrafts = async (kind: IDraftKind | undefined, user: IRequestUser) => {
    const drafts = await prisma.draft.findMany({
        where: { owner_id: user.ownerId, ...(kind ? { kind } : {}) },
        select: draftSelect,
        orderBy: { updated_at: "desc" },
    });

    // The list shows a name, not a uuid. One query for the whole page rather
    // than a join, because most drafts share an author.
    const authorIds = [...new Set(drafts.map(draft => draft.created_by).filter(Boolean))] as string[];
    const authors = authorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, full_name: true },
        })
        : [];
    const nameById = new Map(authors.map(author => [author.id, author.full_name]));

    return drafts.map(draft => ({
        ...draft,
        created_by_name: draft.created_by ? nameById.get(draft.created_by) ?? "" : "",
    }));
};

const saveDraft = async (payload: ISaveDraftPayload, user: IRequestUser) => {
    return prisma.draft.create({
        data: {
            kind: payload.kind,
            title: payload.title ?? "",
            subtitle: payload.subtitle ?? "",
            amount: payload.amount ?? 0,
            // Round-tripped the way recycleSnapshot.ts writes its Json column:
            // that is what satisfies Prisma's InputJsonValue, and it flattens
            // anything the body parser left as a non-plain value.
            data: JSON.parse(JSON.stringify(payload.data)),
            owner_id: user.ownerId,
            created_by: user.userId,
        },
        select: draftSelect,
    });
};

/**
 * Overwrite a parked draft.
 *
 * created_by is left alone on purpose: it records who started the order, which
 * is what the list is answering, and re-stamping it on every save would rename
 * a colleague's draft to whoever last touched it.
 */
const updateDraft = async (id: string, payload: ISaveDraftPayload, user: IRequestUser) => {
    const existing = await prisma.draft.findFirst({
        where: { id, owner_id: user.ownerId },
        select: { id: true },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Draft not found");
    }

    return prisma.draft.update({
        where: { id },
        data: {
            kind: payload.kind,
            title: payload.title ?? "",
            subtitle: payload.subtitle ?? "",
            amount: payload.amount ?? 0,
            // Round-tripped the way recycleSnapshot.ts writes its Json column:
            // that is what satisfies Prisma's InputJsonValue, and it flattens
            // anything the body parser left as a non-plain value.
            data: JSON.parse(JSON.stringify(payload.data)),
        },
        select: draftSelect,
    });
};

/**
 * Throw a draft away.
 *
 * No recycle bin entry: a draft is scratch paper, and the published order it
 * became is the record worth keeping. Deleting one that was never published
 * loses only what somebody chose to abandon.
 */
const deleteDraft = async (id: string, user: IRequestUser) => {
    const existing = await prisma.draft.findFirst({
        where: { id, owner_id: user.ownerId },
        select: { id: true },
    });

    if (!existing) {
        throw new AppError(status.NOT_FOUND, "Draft not found");
    }

    await prisma.draft.delete({ where: { id } });

    return { id };
};

export const DraftService = { listDrafts, saveDraft, updateDraft, deleteDraft };
