import status from "http-status";
import { Role } from "../../../generated/prisma/enums.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { IDraftKind, ISaveDraftPayload } from "./draft.validation.js";

/**
 * The list deliberately leaves `data` out.
 *
 * sendResponse deep-copies every response, so returning forty full snapshots
 * would mean forty recursive copies of data the list page renders none of. The
 * columns beside it exist precisely so a draft can be listed without opening it.
 */
const listSelect = {
    id: true,
    kind: true,
    title: true,
    subtitle: true,
    amount: true,
    payload_version: true,
    created_by: true,
    updated_by: true,
    created_at: true,
    updated_at: true,
} as const;

const fullSelect = { ...listSelect, data: true } as const;

/**
 * How many drafts one workspace may park, per kind.
 *
 * Nothing expires a draft but somebody tidying up, so this is the backstop: a
 * stuck retry - or a future auto-save nobody thought through - cannot write
 * rows without end. Far above any real use; a shop with a hundred unfinished
 * orders has a different problem.
 */
const MAX_DRAFTS_PER_KIND = 100;

const withAuthorNames = async <T extends { created_by: string | null; updated_by: string | null }>(rows: T[]) => {
    // One query for the page rather than a join, because most drafts in a shop
    // share an author.
    const ids = [...new Set(rows.flatMap(row => [row.created_by, row.updated_by]).filter(Boolean))] as string[];
    const users = ids.length > 0
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } })
        : [];
    const nameById = new Map(users.map(user => [user.id, user.full_name]));

    return rows.map(row => ({
        ...row,
        created_by_name: row.created_by ? nameById.get(row.created_by) ?? "" : "",
        updated_by_name: row.updated_by ? nameById.get(row.updated_by) ?? "" : "",
    }));
};

/**
 * Every draft in this workspace, most recently touched first.
 *
 * Scoped by owner_id and NOT by created_by, deliberately: one person starts an
 * order, another finishes it, and the owner sees the lot. A draft only its
 * author could see would be lost the moment they went home.
 */
const listDrafts = async (kind: IDraftKind | undefined, user: IRequestUser) => {
    const drafts = await prisma.draft.findMany({
        where: { owner_id: user.ownerId, ...(kind ? { kind } : {}) },
        select: listSelect,
        orderBy: { updated_at: "desc" },
    });

    return withAuthorNames(drafts);
};

/** One draft, snapshot included - this is what the form page hydrates from. */
const getDraft = async (id: string, user: IRequestUser) => {
    const draft = await prisma.draft.findFirst({
        where: { id, owner_id: user.ownerId },
        select: fullSelect,
    });

    if (!draft) {
        throw new AppError(status.NOT_FOUND, "Draft not found");
    }

    return (await withAuthorNames([draft]))[0];
};

// checkAuth lets through the union of both create roles, because one route
// serves both kinds. The narrower rule belongs here, where the kind is known:
// sales staff may write invoices, not purchase orders.
const assertMayWrite = (kind: IDraftKind, user: IRequestUser) => {
    if (kind === "purchase_order" && user.role === Role.sales_staff) {
        throw new AppError(status.FORBIDDEN, "Sales staff cannot save purchase order drafts");
    }
};

const saveDraft = async (payload: ISaveDraftPayload, user: IRequestUser) => {
    assertMayWrite(payload.kind, user);

    const parked = await prisma.draft.count({
        where: { owner_id: user.ownerId, kind: payload.kind },
    });

    if (parked >= MAX_DRAFTS_PER_KIND) {
        throw new AppError(
            status.BAD_REQUEST,
            `There are already ${MAX_DRAFTS_PER_KIND} drafts saved. Publish or delete some before saving another.`
        );
    }

    return prisma.draft.create({
        data: {
            kind: payload.kind,
            title: payload.title ?? "",
            subtitle: payload.subtitle ?? "",
            amount: payload.amount ?? 0,
            payload_version: payload.payload_version ?? 1,
            // Round-tripped the way recycleSnapshot.ts writes its Json column:
            // that is what satisfies Prisma's InputJsonValue, and it flattens
            // anything the body parser left as a non-plain value.
            data: JSON.parse(JSON.stringify(payload.data)),
            owner_id: user.ownerId,
            created_by: user.userId,
            updated_by: user.userId,
        },
        select: fullSelect,
    });
};

/**
 * Overwrite a parked draft.
 *
 * created_by is left alone on purpose: it records who started the order, which
 * is what the list is answering. updated_by is what moves, so "who had this
 * last" has an answer when two people share one draft.
 */
const updateDraft = async (id: string, payload: ISaveDraftPayload, user: IRequestUser) => {
    assertMayWrite(payload.kind, user);

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
            payload_version: payload.payload_version ?? 1,
            data: JSON.parse(JSON.stringify(payload.data)),
            updated_by: user.userId,
        },
        select: fullSelect,
    });
};

/**
 * Throw a draft away.
 *
 * No recycle bin entry: a draft is scratch paper, and the published order it
 * became is the record worth keeping. Deleting one that was never published
 * loses only what somebody chose to abandon.
 *
 * Not scoped to its author either - publishing deletes the draft, and the
 * person publishing is often not the person who started it.
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

export const DraftService = { listDrafts, getDraft, saveDraft, updateDraft, deleteDraft };
