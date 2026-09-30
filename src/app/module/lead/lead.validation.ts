import z from "zod";

// Everything but designation is required: an organization with no address is
// a lead nobody can go back to, and the whole point of writing one down is
// that somebody picks it up weeks later. Designation is the one thing that can
// genuinely be unknown after a first call.
export const createLeadZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    organization: z.string("Organization must be string").min(1, "Organization is required"),
    designation: z.string("Designation must be string").optional(),
    name: z.string("Name must be string").min(1, "Name is required"),
    phone: z
        .string("Phone must be string")
        .regex(/^01[0-9]{9}$/, "Phone must be a valid 11-digit number, e.g. 01712345678"),
    address: z.string("Address must be string").min(1, "Address is required"),
    notes: z.string("Notes must be string").optional(),
});

export const updateLeadZodSchema = createLeadZodSchema
    .partial()
    .refine((payload) => Object.keys(payload).length > 0, { message: "Nothing to update" });

export type ICreateLeadPayload = z.infer<typeof createLeadZodSchema>;
export type IUpdateLeadPayload = z.infer<typeof updateLeadZodSchema>;
