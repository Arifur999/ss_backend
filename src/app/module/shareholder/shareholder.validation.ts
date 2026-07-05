import z from "zod";

export const createShareholderZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    phone: z.string("Phone must be string").optional(),
    address: z.string("Address must be string").optional(),
    share_percentage: z.number("Share percentage must be a number").min(0).max(100).optional(),
    opening_amount: z.number("Opening amount must be a number").optional(),
    sort_order: z.number("Sort order must be a number").int().optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateShareholderZodSchema = createShareholderZodSchema.partial();

export type ICreateShareholderPayload = z.infer<typeof createShareholderZodSchema>;
export type IUpdateShareholderPayload = z.infer<typeof updateShareholderZodSchema>;
