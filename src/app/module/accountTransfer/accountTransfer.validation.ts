import z from "zod";

export const createAccountTransferZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    from_account_id: z.uuid("From account id must be a valid UUID"),
    from_account_name: z.string("From account name must be string").min(1, "From account name is required"),
    to_account_id: z.uuid("To account id must be a valid UUID"),
    to_account_name: z.string("To account name must be string").min(1, "To account name is required"),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    notes: z.string("Notes must be string").optional(),
});

export type ICreateAccountTransferPayload = z.infer<typeof createAccountTransferZodSchema>;
