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
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").min(1, "Account name is required"),
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
    account_id: z.uuid("Account id must be a valid UUID").optional(),
    account_name: z.string("Account name must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export type ICreateOtherIncomePayload = z.infer<typeof createOtherIncomeZodSchema>;
export type IUpdateOtherIncomePayload = z.infer<typeof updateOtherIncomeZodSchema>;
