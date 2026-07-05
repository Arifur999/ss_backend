import z from "zod";
import { AccountType } from "../../../generated/prisma/enums.js";

export const createAccountZodSchema = z.object({
    name: z.string("Name must be string").min(1, "Name is required"),
    type: z.enum(
        [AccountType.cash, AccountType.bank, AccountType.mfs, AccountType.personal, AccountType.other],
        "Type must be one of cash, bank, mfs, personal, other"
    ),
    opening_balance: z.number("Opening balance must be a number").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
    sort_order: z.number("Sort order must be a number").int().optional(),
});

export const updateAccountZodSchema = createAccountZodSchema.partial();

export type ICreateAccountPayload = z.infer<typeof createAccountZodSchema>;
export type IUpdateAccountPayload = z.infer<typeof updateAccountZodSchema>;
