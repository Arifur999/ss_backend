import z from "zod";

export const createEmployeeZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    phone: z.string("Phone must be string").nullable().optional(),
    address: z.string("Address must be string").nullable().optional(),
    join_date: z.string("Join date must be string (YYYY-MM-DD)").min(1, "Join date is required"),
    resign_date: z.string("Resign date must be string (YYYY-MM-DD)").nullable().optional(),
    notes: z.string("Notes must be string").nullable().optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateEmployeeZodSchema = createEmployeeZodSchema.partial();

export type ICreateEmployeePayload = z.infer<typeof createEmployeeZodSchema>;
export type IUpdateEmployeePayload = z.infer<typeof updateEmployeeZodSchema>;
