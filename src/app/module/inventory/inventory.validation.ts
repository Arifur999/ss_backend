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

/**
 * A manual DP override from the Inventory page.
 *
 * The route had no schema: product_id was untyped and dp_price came off the body
 * through Number(), so a negative value landed on inventory.dp_price and then
 * multiplied into stock_value, giving a negative stock valuation. A wrong-but-
 * positive value silently rewrote cost_price on historical sale lines (now bounded
 * to the current month in the service, but still worth validating on the way in).
 *
 * null is allowed and meaningful - it clears the override so the product's own
 * cost price takes over again.
 */
export const setDpPriceZodSchema = z.object({
    product_id: z.uuid("Product id must be a valid UUID"),
    dp_price: z.number("DP price must be a number").nonnegative("DP price cannot be negative").nullable(),
});

export type ISetDpPricePayload = z.infer<typeof setDpPriceZodSchema>;
