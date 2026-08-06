import z from "zod";

export const createPlatformExpenseZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    category: z.string("Category must be string").min(1, "Category is required"),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    notes: z.string("Notes must be string").optional(),
});

export const updatePlatformExpenseZodSchema = createPlatformExpenseZodSchema.partial();

export const createPlatformWithdrawalZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    taken_by: z.string("Taken by must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export const updatePlatformWithdrawalZodSchema = createPlatformWithdrawalZodSchema.partial();

export type ICreatePlatformExpensePayload = z.infer<typeof createPlatformExpenseZodSchema>;
export type IUpdatePlatformExpensePayload = z.infer<typeof updatePlatformExpenseZodSchema>;
export type ICreatePlatformWithdrawalPayload = z.infer<typeof createPlatformWithdrawalZodSchema>;
export type IUpdatePlatformWithdrawalPayload = z.infer<typeof updatePlatformWithdrawalZodSchema>;
