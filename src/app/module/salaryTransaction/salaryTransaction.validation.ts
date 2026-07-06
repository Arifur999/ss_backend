import z from "zod";

export const createSalaryTransactionZodSchema = z.object({
    employee_id: z.uuid("Employee id must be a valid UUID"),
    employee_name: z.string("Employee name must be string").optional(),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    amount: z.number("Amount must be a number").nonnegative().optional(),
    bonus: z.number("Bonus must be a number").nonnegative().optional(),
    payment_type: z.string("Payment type must be string").optional(),
    category_id: z.uuid("Category id must be a valid UUID").nullable().optional(),
    category_name: z.string("Category name must be string").optional(),
    period_from: z.string("Period from must be string (YYYY-MM-DD)").nullable().optional(),
    period_to: z.string("Period to must be string (YYYY-MM-DD)").nullable().optional(),
    account_id: z.uuid("Account id must be a valid UUID").nullable().optional(),
    account_name: z.string("Account name must be string").optional(),
    expense_id: z.uuid("Expense id must be a valid UUID").nullable().optional(),
    notes: z.string("Notes must be string").nullable().optional(),
});

export const updateSalaryTransactionZodSchema = createSalaryTransactionZodSchema.partial();

export type ICreateSalaryTransactionPayload = z.infer<typeof createSalaryTransactionZodSchema>;
export type IUpdateSalaryTransactionPayload = z.infer<typeof updateSalaryTransactionZodSchema>;
