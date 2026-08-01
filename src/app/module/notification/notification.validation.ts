import z from "zod";

// Super admin composes a broadcast notification (title + message).
export const createNotificationZodSchema = z.object({
    title: z.string("Title must be string").trim().min(1, "Title is required").max(150, "Title is too long"),
    message: z.string("Message must be string").trim().min(1, "Message is required").max(2000, "Message is too long"),
});

export type ICreateNotificationPayload = z.infer<typeof createNotificationZodSchema>;
