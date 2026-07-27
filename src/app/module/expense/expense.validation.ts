import z from "zod";

export const createExpenseZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    category_id: z.uuid("Category id must be a valid UUID"),
    category_name: z.string("Category name must be string").min(1, "Category name is required"),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    // Optional: a "discount allowed" expense has no cash account (it must not
    // reduce any account balance). Regular expenses still send both from the
    // expense form.
    account_id: z.uuid("Account id must be a valid UUID").nullable().optional(),
    account_name: z.string("Account name must be string").optional().transform((value) => value ?? ""),
    branch_id: z.uuid("Branch id must be a valid UUID").nullable().optional(),
    branch_name: z.string("Branch name must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export const updateExpenseZodSchema = createExpenseZodSchema.partial();

export type ICreateExpensePayload = z.infer<typeof createExpenseZodSchema>;
export type IUpdateExpensePayload = z.infer<typeof updateExpenseZodSchema>;
