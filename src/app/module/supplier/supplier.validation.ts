import z from "zod";

export const createSupplierZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    company_name: z.string("Company name must be string").optional(),
    person_name: z.string("Person name must be string").optional(),
    due_type: z.string("Due type must be string").optional(),
    phone: z.string("Phone must be string").optional(),
    email: z.string("Email must be string").optional(),
    address: z.string("Address must be string").optional(),
    opening_due: z.number("Opening due must be a number").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateSupplierZodSchema = createSupplierZodSchema.partial();

export type ICreateSupplierPayload = z.infer<typeof createSupplierZodSchema>;
export type IUpdateSupplierPayload = z.infer<typeof updateSupplierZodSchema>;
