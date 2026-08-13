import z from "zod";

const month = (label: string) =>
    z.number(`${label} must be a number`).int().min(1, `${label} must be between 1 and 12`).max(12, `${label} must be between 1 and 12`);
const year = (label: string) =>
    z.number(`${label} must be a number`).int().min(2000, `${label} looks wrong`).max(2100, `${label} looks wrong`);

export const createPurchaseTargetZodSchema = z
    .object({
        supplier_id: z.uuid("Supplier id must be a valid UUID"),
        start_year: year("Start year"),
        start_month: month("Start month"),
        end_year: year("End year"),
        end_month: month("End month"),
        total_amount: z.number("Total amount must be a number").nonnegative("Total amount cannot be negative"),
    })
    // Checked here rather than on the page alone: a backwards range would make
    // "how many months" negative, and the per-month figure meaningless.
    .refine(
        (value) => value.end_year * 12 + value.end_month >= value.start_year * 12 + value.start_month,
        { message: "The end month cannot come before the start month", path: ["end_month"] },
    );

export const updatePurchaseTargetZodSchema = z.object({
    supplier_id: z.uuid("Supplier id must be a valid UUID").optional(),
    start_year: year("Start year").optional(),
    start_month: month("Start month").optional(),
    end_year: year("End year").optional(),
    end_month: month("End month").optional(),
    total_amount: z.number("Total amount must be a number").nonnegative("Total amount cannot be negative").optional(),
});

export type ICreatePurchaseTargetPayload = z.infer<typeof createPurchaseTargetZodSchema>;
export type IUpdatePurchaseTargetPayload = z.infer<typeof updatePurchaseTargetZodSchema>;
