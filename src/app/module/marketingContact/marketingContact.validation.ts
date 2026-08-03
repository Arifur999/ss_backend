import z from "zod";

export const createMarketingContactZodSchema = z.object({
    name: z.string("Name must be string").optional(),
    phone: z
        .string("Phone must be string")
        .regex(/^01[0-9]{9}$/, "Phone must be a valid 11-digit number, e.g. 01712345678"),
    note: z.string("Note must be string").optional(),
});

export const updateMarketingContactZodSchema = createMarketingContactZodSchema.partial();

export type ICreateMarketingContactPayload = z.infer<typeof createMarketingContactZodSchema>;
export type IUpdateMarketingContactPayload = z.infer<typeof updateMarketingContactZodSchema>;
