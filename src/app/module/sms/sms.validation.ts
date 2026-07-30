import z from "zod";

// Owner submits a manual bKash purchase of an SMS credit package. Amount +
// sms_count are resolved server-side from the package, never trusted here.
export const submitSmsPurchaseZodSchema = z.object({
    package_id: z.string("Package id must be string").min(1, "Package id is required"),
    sender_number: z
        .string("bKash number must be string")
        .regex(/^01[0-9]{9}$/, "Enter a valid 11-digit bKash number (e.g. 01XXXXXXXXX)"),
    trx_id: z
        .string("Transaction ID must be string")
        .min(6, "Transaction ID looks too short")
        .max(30, "Transaction ID looks too long"),
});

export type ISubmitSmsPurchasePayload = z.infer<typeof submitSmsPurchaseZodSchema>;

// Owner sends an SMS batch. Recipients accepted either as an array or as a
// single string (comma / space / newline separated); normalized in the service.
export const sendSmsZodSchema = z.object({
    recipients: z.union([z.string(), z.array(z.string())]),
    message: z
        .string("Message must be string")
        .trim()
        .min(1, "Message cannot be empty")
        .max(1000, "Message is too long"),
});

export type ISendSmsPayload = z.infer<typeof sendSmsZodSchema>;

// Super admin creates a sellable SMS package.
export const createSmsPackageZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    sms_count: z.number("SMS count must be a number").int().positive("SMS count must be greater than 0"),
    price: z.number("Price must be a number").min(0, "Price cannot be negative"),
    active: z.boolean().optional(),
});

export type ICreateSmsPackagePayload = z.infer<typeof createSmsPackageZodSchema>;

export const updateSmsPackageZodSchema = z.object({
    name: z.string().min(1).optional(),
    sms_count: z.number().int().positive().optional(),
    price: z.number().min(0).optional(),
    active: z.boolean().optional(),
});

export type IUpdateSmsPackagePayload = z.infer<typeof updateSmsPackageZodSchema>;

// Super admin approves / rejects a manual SMS purchase. On "paid" the owner's
// wallet is topped up with the package's credits.
export const updateSmsPurchaseZodSchema = z.object({
    status: z.enum(["pending", "paid", "rejected"], "status must be pending, paid or rejected"),
});

export type IUpdateSmsPurchasePayload = z.infer<typeof updateSmsPurchaseZodSchema>;
