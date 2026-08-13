import z from "zod";

// Numeric product fields (prices, discounts, qty) are all OPTIONAL - a product
// can be created with none of them and have them filled in later. The frontend
// sends `null` for an empty field, but the Prisma columns are non-nullable with
// a default, so we normalize null -> undefined here: that lets the DB default
// (0) apply instead of trying to write an explicit null (which would error).
const optionalNumber = (label: string) =>
    z
        .number(`${label} must be a number`)
        .nonnegative(`${label} cannot be negative`)
        .nullable()
        .optional()
        .transform((value) => value ?? undefined);

export const createProductZodSchema = z.object({
    product_code: z.string("Product code must be string").min(1, "Product code is required"),
    name: z.string("Name must be string").min(1, "Name is required"),
    image_url: z.string("Image URL must be string").nullable().optional().transform((value) => value ?? ""),
    supplier_id: z.uuid("Supplier id must be a valid UUID").nullable().optional(),
    // Free-text category with client-side suggestions - no managed table.
    category: z.string("Category must be string").nullable().optional(),
    selling_price: optionalNumber("Selling price"),
    cost_price: optionalNumber("Cost price"),
    // Percentage discounts (0-100) on the DP/cost and MRP/selling sides.
    dp_discount: optionalNumber("DP discount"),
    mrp_discount: optionalNumber("MRP discount"),
    // Legacy flat discount amount - still accepted so old CSV/import payloads
    // don't break, but the app no longer sends it.
    discount: optionalNumber("Discount"),
    size: z.string("Size must be string").nullable().optional(),
    weight: z.string("Weight must be string").nullable().optional(),
    opening_qty: z
        .number("Opening qty must be a number")
        .int("Opening qty must be a whole number")
        .nonnegative("Opening qty cannot be negative")
        .nullable()
        .optional()
        .transform((value) => value ?? undefined),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateProductZodSchema = createProductZodSchema.partial();

export const bulkUpsertProductsZodSchema = z.object({
    products: z.array(createProductZodSchema).min(1, "At least one product is required"),
});

/**
 * A price-only update, matched on product code.
 *
 * The four price fields are all this accepts - no name, no supplier, no
 * quantity, no is_active. That is deliberate: the schema itself is what
 * guarantees a monthly price file cannot change anything but prices, rather
 * than a check inside the service that a later edit could forget to keep.
 *
 * Each price is optional because a blank cell in the file means "leave this one
 * alone". A field that is absent is not written; a field sent as 0 is a real
 * zero the owner asked for.
 */
const priceField = (label: string) =>
    z
        .number(`${label} must be a number`)
        .nonnegative(`${label} cannot be negative`)
        .optional();

export const bulkUpdatePricesZodSchema = z.object({
    // A preview run: do every lookup and report what would change, write nothing.
    dry_run: z.boolean("dry_run must be a boolean").optional(),
    prices: z
        .array(
            z.object({
                product_code: z.string("Product code must be string").min(1, "Product code is required"),
                cost_price: priceField("Cost price"),
                selling_price: priceField("Selling price"),
                dp_discount: priceField("DP discount"),
                mrp_discount: priceField("MRP discount"),
            }),
        )
        .min(1, "At least one row is required"),
});

export type IBulkUpdatePricesPayload = z.infer<typeof bulkUpdatePricesZodSchema>;

export type ICreateProductPayload = z.infer<typeof createProductZodSchema>;
export type IUpdateProductPayload = z.infer<typeof updateProductZodSchema>;
