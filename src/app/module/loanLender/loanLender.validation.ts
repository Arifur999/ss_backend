import z from "zod";
import { LenderType } from "../../../generated/prisma/enums.js";

export const createLoanLenderZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    lender_type: z.enum([LenderType.bank, LenderType.person, LenderType.boss], "Lender type must be bank, person or boss").optional(),
    phone: z.string("Phone must be string").optional(),
    address: z.string("Address must be string").optional(),
    opening_balance: z.number("Opening balance must be a number").optional(),
    notes: z.string("Notes must be string").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
});

export const updateLoanLenderZodSchema = createLoanLenderZodSchema.partial();

export type ICreateLoanLenderPayload = z.infer<typeof createLoanLenderZodSchema>;
export type IUpdateLoanLenderPayload = z.infer<typeof updateLoanLenderZodSchema>;
