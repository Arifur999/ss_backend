import z from "zod";

export const upsertMonthlyTargetZodSchema = z.object({
    year: z.number("Year must be a number").int().min(2000).max(2100),
    month: z.number("Month must be a number").int().min(1, "Month must be between 1 and 12").max(12, "Month must be between 1 and 12"),
    sales_target: z.number("Sales target must be a number").nonnegative().optional(),
    profit_target: z.number("Profit target must be a number").nonnegative().optional(),
});

export type IUpsertMonthlyTargetPayload = z.infer<typeof upsertMonthlyTargetZodSchema>;

/**
 * Editing a target by id.
 *
 * The route had no schema, so month: 13 wrote cleanly - and every dashboard and
 * report looks a target up by the current year and month, so the goal simply
 * vanished from the app while still sitting in the table. The same bounds as the
 * upsert schema, with every field optional.
 */
export const updateMonthlyTargetZodSchema = z.object({
    year: z.number("Year must be a number").int().min(2000).max(2100).optional(),
    month: z.number("Month must be a number").int().min(1, "Month must be between 1 and 12").max(12, "Month must be between 1 and 12").optional(),
    sales_target: z.number("Sales target must be a number").nonnegative().optional(),
    profit_target: z.number("Profit target must be a number").nonnegative().optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
    message: "Nothing to update",
});

export type IUpdateMonthlyTargetPayload = z.infer<typeof updateMonthlyTargetZodSchema>;
