import z from "zod";

// Super admin editable payment + reminder-email configuration.
// bkash_qr_url is optional - the QR image is uploaded separately via
// POST /uploads/image and its returned URL is saved here.
export const updatePlatformSettingsZodSchema = z.object({
    bkash_number: z.string("bKash number must be string").optional(),
    bkash_qr_url: z.string("QR URL must be string").optional(),
    yearly_price: z.number("Yearly price must be a number").positive("Yearly price must be positive").optional(),
    reminder_subject: z.string("Reminder subject must be string").min(1, "Subject cannot be empty").optional(),
    reminder_body: z.string("Reminder body must be string").min(1, "Body cannot be empty").optional(),
});

export type IUpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsZodSchema>;
