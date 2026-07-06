import z from "zod";

export const createCustomerPaymentZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    customer_id: z.uuid("Customer id must be a valid UUID"),
    customer_name: z.string("Customer name must be string"),
    sale_id: z.uuid("Sale id must be a valid UUID").nullable().optional(),
    invoice_no: z.string("Invoice no must be string").optional(),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string"),
    notes: z.string("Notes must be string").optional(),
});

export const updateCustomerPaymentZodSchema = createCustomerPaymentZodSchema.partial();

export type ICreateCustomerPaymentPayload = z.infer<typeof createCustomerPaymentZodSchema>;
export type IUpdateCustomerPaymentPayload = z.infer<typeof updateCustomerPaymentZodSchema>;
