import z from "zod";

export const upsertAttendanceZodSchema = z.object({
    employee_id: z.uuid("Employee id must be a valid UUID"),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    present: z.boolean("present must be a boolean").optional(),
    start_time: z.string("Start time must be string").nullable().optional(),
    end_time: z.string("End time must be string").nullable().optional(),
    total_hours: z.string("Total hours must be string").nullable().optional(),
    notes: z.string("Notes must be string").nullable().optional(),
});

export type IUpsertAttendancePayload = z.infer<typeof upsertAttendanceZodSchema>;
