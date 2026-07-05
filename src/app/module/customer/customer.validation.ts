import z from "zod";

export const createCustomerZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    phone: z.string("Phone must be string").optional(),
    email: z.string("Email must be string").optional(),
    address: z.string("Address must be string").optional(),
    opening_due: z.number("Opening due must be a number").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateCustomerZodSchema = createCustomerZodSchema.partial();

export type ICreateCustomerPayload = z.infer<typeof createCustomerZodSchema>;
export type IUpdateCustomerPayload = z.infer<typeof updateCustomerZodSchema>;
