import z from "zod";

export const upsertMonthlyTargetZodSchema = z.object({
    year: z.number("Year must be a number").int().min(2000).max(2100),
    month: z.number("Month must be a number").int().min(1, "Month must be between 1 and 12").max(12, "Month must be between 1 and 12"),
    sales_target: z.number("Sales target must be a number").nonnegative().optional(),
    profit_target: z.number("Profit target must be a number").nonnegative().optional(),
});

export type IUpsertMonthlyTargetPayload = z.infer<typeof upsertMonthlyTargetZodSchema>;
