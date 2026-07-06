import z from "zod";

export const createSalePaymentZodSchema = z.object({
    sale_id: z.uuid("Sale id must be a valid UUID"),
    invoice_no: z.string("Invoice no must be string").optional(),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    customer_id: z.uuid("Customer id must be a valid UUID").nullable().optional(),
    customer_name: z.string("Customer name must be string").optional(),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").optional(),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
});

export const updateSalePaymentZodSchema = createSalePaymentZodSchema.partial();

export type ICreateSalePaymentPayload = z.infer<typeof createSalePaymentZodSchema>;
export type IUpdateSalePaymentPayload = z.infer<typeof updateSalePaymentZodSchema>;
