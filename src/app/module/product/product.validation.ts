import z from "zod";

export const createProductZodSchema = z.object({
    product_code: z.string("Product code must be string").min(1, "Product code is required"),
    name: z.string("Name must be string").min(1, "Name is required"),
    image_url: z.string("Image URL must be string").optional(),
    supplier_id: z.uuid("Supplier id must be a valid UUID").nullable().optional(),
    selling_price: z.number("Selling price must be a number").nonnegative().optional(),
    cost_price: z.number("Cost price must be a number").nonnegative().optional(),
    discount: z.number("Discount must be a number").optional(),
    size: z.string("Size must be string").nullable().optional(),
    weight: z.string("Weight must be string").nullable().optional(),
    opening_qty: z.number("Opening qty must be a number").int().nonnegative().optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateProductZodSchema = createProductZodSchema.partial();

export const bulkUpsertProductsZodSchema = z.object({
    products: z.array(createProductZodSchema).min(1, "At least one product is required"),
});

export type ICreateProductPayload = z.infer<typeof createProductZodSchema>;
export type IUpdateProductPayload = z.infer<typeof updateProductZodSchema>;
