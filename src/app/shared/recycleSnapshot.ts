import z from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { IRequestUser } from "../interfaces/requestUser.interface.js";

// Deletable records get snapshotted into recycle_bin_items (the old app kept
// these snapshots in localStorage). The frontend passes the same display
// metadata it used to compute; the raw row JSON is captured server-side.
export const recycleMetaZodSchema = z.object({
    type: z.string("Recycle type must be string").min(1),
    title: z.string("Title must be string").optional(),
    subtitle: z.string("Subtitle must be string").optional(),
    amount: z.number("Amount must be a number").optional(),
}).optional();

export type IRecycleMeta = z.infer<typeof recycleMetaZodSchema>;

export const buildRecycleItemData = (input: {
    user: IRequestUser;
    tableName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any;
    meta?: IRecycleMeta;
    fallbackType: string;
    fallbackTitle?: string;
    fallbackSubtitle?: string;
    fallbackAmount?: number | Prisma.Decimal;
}) => ({
    owner_id: input.user.ownerId,
    type: input.meta?.type ?? input.fallbackType,
    title: input.meta?.title ?? input.fallbackTitle ?? "",
    subtitle: input.meta?.subtitle ?? input.fallbackSubtitle ?? "",
    amount: input.meta?.amount ?? input.fallbackAmount ?? 0,
    table_name: input.tableName,
    data: JSON.parse(JSON.stringify(input.row)),
    deleted_by: input.user.userId,
});
