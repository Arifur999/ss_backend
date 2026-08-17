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

/**
 * Editing one attendance row.
 *
 * The route had no schema, and `date` was writable to any value - which is how a
 * second row for the same employee on the same day could be created deliberately,
 * doubling that day in payroll. date is deliberately NOT editable here: moving an
 * attendance record to another day is a delete plus a fresh entry, which goes
 * through the upsert path and its uniqueness check.
 */
export const updateAttendanceZodSchema = z.object({
    present: z.boolean("present must be a boolean").optional(),
    start_time: z.string("Start time must be string").nullable().optional(),
    end_time: z.string("End time must be string").nullable().optional(),
    total_hours: z.string("Total hours must be string").nullable().optional(),
    notes: z.string("Notes must be string").nullable().optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
    message: "Nothing to update",
});

export type IUpdateAttendancePayload = z.infer<typeof updateAttendanceZodSchema>;
