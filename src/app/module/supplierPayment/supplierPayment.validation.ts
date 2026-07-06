import z from "zod";

export const createSupplierPaymentZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    supplier_id: z.uuid("Supplier id must be a valid UUID"),
    supplier_name: z.string("Supplier name must be string"),
    purchase_id: z.uuid("Purchase id must be a valid UUID").nullable().optional(),
    purchase_si_no: z.string("Purchase SI no must be string").optional(),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string"),
    notes: z.string("Notes must be string").optional(),
});

export const updateSupplierPaymentZodSchema = createSupplierPaymentZodSchema.partial();

export type ICreateSupplierPaymentPayload = z.infer<typeof createSupplierPaymentZodSchema>;
export type IUpdateSupplierPaymentPayload = z.infer<typeof updateSupplierPaymentZodSchema>;
