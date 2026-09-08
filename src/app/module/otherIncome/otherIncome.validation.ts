import z from "zod";
import { IncomeType } from "../../../generated/prisma/enums.js";

// Mirrors the old other_incomes_source_check DB constraint:
// supplier income needs a supplier, other income needs a source name.
export const createOtherIncomeZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    income_type: z.enum([IncomeType.supplier, IncomeType.other], "Income type must be supplier or other"),
    supplier_id: z.uuid("Supplier id must be a valid UUID").nullable().optional(),
    supplier_name: z.string("Supplier name must be string").optional(),
    source_name: z.string("Source name must be string").optional(),
    amount: z.number("Amount must be a number").positive("Amount must be positive"),
    // Optional: the other-income a loan profit RECEIPT mirrors has no cash
    // account. The loan row already moved the money, and Balance.tsx sums other
    // income per account_id - so a second row naming the same account would
    // count that money twice. Regular entries still send both from the form.
    account_id: z.uuid("Account id must be a valid UUID").nullable().optional(),
    account_name: z.string("Account name must be string").optional().transform((value) => value ?? ""),
    notes: z.string("Notes must be string").optional(),
}).refine(
    (data) =>
        data.income_type === IncomeType.supplier
            ? Boolean(data.supplier_id && data.supplier_name?.trim())
            : Boolean(data.source_name?.trim()),
    { message: "Supplier income needs a supplier; other income needs a source name" }
);

export const updateOtherIncomeZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").optional(),
    income_type: z.enum([IncomeType.supplier, IncomeType.other], "Income type must be supplier or other").optional(),
    supplier_id: z.uuid("Supplier id must be a valid UUID").nullable().optional(),
    supplier_name: z.string("Supplier name must be string").optional(),
    source_name: z.string("Source name must be string").optional(),
    amount: z.number("Amount must be a number").positive("Amount must be positive").optional(),
    // Nullable for the same reason as create: a loan-mirrored row carries no
    // account, and re-saving one from the Other Income page must not 400.
    account_id: z.uuid("Account id must be a valid UUID").nullable().optional(),
    account_name: z.string("Account name must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export type ICreateOtherIncomePayload = z.infer<typeof createOtherIncomeZodSchema>;
export type IUpdateOtherIncomePayload = z.infer<typeof updateOtherIncomeZodSchema>;
