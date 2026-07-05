import z from "zod";

export const createExpenseCategoryZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    color: z.string("Color must be string").optional(),
    monthly_budget: z.number("Monthly budget must be a number").nonnegative().optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateExpenseCategoryZodSchema = createExpenseCategoryZodSchema.partial();

export type ICreateExpenseCategoryPayload = z.infer<typeof createExpenseCategoryZodSchema>;
export type IUpdateExpenseCategoryPayload = z.infer<typeof updateExpenseCategoryZodSchema>;
