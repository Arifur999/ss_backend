import z from "zod";

// Super admin editable payment + reminder-email configuration.
// bkash_qr_url is optional - the QR image is uploaded separately via
// POST /uploads/image and its returned URL is saved here.
export const updatePlatformSettingsZodSchema = z.object({
    bkash_number: z.string("bKash number must be string").optional(),
    bkash_qr_url: z.string("QR URL must be string").optional(),
    yearly_price: z.number("Yearly price must be a number").positive("Yearly price must be positive").optional(),
    yearly_original_price: z.number("Original price must be a number").positive("Original price must be positive").optional(),
    monthly_price: z.number("Monthly price must be a number").positive("Monthly price must be positive").optional(),
    support_number: z.string("Support number must be string").optional(),
    reminder_subject: z.string("Reminder subject must be string").min(1, "Subject cannot be empty").optional(),
    reminder_body: z.string("Reminder body must be string").min(1, "Body cannot be empty").optional(),
});

export type IUpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsZodSchema>;

// Preview of the plan welcome card. `to` is optional - left out, the card goes
// to the super admin making the request.
export const sendTestGiftCardZodSchema = z.object({
    to: z.string("Email must be string").email("Enter a valid email address").optional(),
});
