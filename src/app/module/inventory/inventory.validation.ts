import z from "zod";

export const adjustInventoryZodSchema = z.object({
    product_id: z.uuid("Product id must be a valid UUID"),
    product_name: z.string("Product name must be string").min(1, "Product name is required"),
    qty_change: z.number("Qty change must be a number").int(),
    dp_price: z.number("DP price must be a number").nonnegative().optional(),
    mrp_price: z.number("MRP price must be a number").nonnegative().optional(),
    notes: z.string("Notes must be string").optional(),
});

export type IAdjustInventoryPayload = z.infer<typeof adjustInventoryZodSchema>;
