import z from "zod";
import { ShippingStatus, ReceiveCondition } from "../../../generated/prisma/enums.js";

const purchaseItemZodSchema = z.object({
    product_id: z.uuid("Product id must be a valid UUID"),
    product_code: z.string("Product code must be string"),
    product_name: z.string("Product name must be string"),
    dp_price: z.number("DP price must be a number").nonnegative().optional(),
    discount_pct: z.number("Discount pct must be a number").optional(),
    actual_dp: z.number("Actual DP must be a number").nonnegative().optional(),
    qty: z.number("Qty must be a number").int().positive(),
    total_amount: z.number("Total amount must be a number").nonnegative().optional(),
    sp_pct: z.number("SP pct must be a number").optional(),
    sp_amount: z.number("SP amount must be a number").optional(),
    received_qty: z.number("Received qty must be a number").int().nonnegative().optional(),
});

export const createPurchaseZodSchema = z.object({
    si_no: z.string("SI no must be string").min(1, "SI no is required"),
    supplier_id: z.uuid("Supplier id must be a valid UUID"),
    supplier_name: z.string("Supplier name must be string"),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    total_amount: z.number("Total amount must be a number").nonnegative().optional(),
    discount_amount: z.number("Discount amount must be a number").nonnegative().optional(),
    net_amount: z.number("Net amount must be a number").nonnegative().optional(),
    paid_amount: z.number("Paid amount must be a number").nonnegative().optional(),
    due_amount: z.number("Due amount must be a number").optional(),
    shipping_status: z.enum([ShippingStatus.pending, ShippingStatus.partial, ShippingStatus.received], "Invalid shipping status").optional(),
    notes: z.string("Notes must be string").optional(),
    items: z.array(purchaseItemZodSchema).min(1, "At least one item is required"),
});

export const updatePurchaseZodSchema = z.object({
    si_no: z.string("SI no must be string").optional(),
    supplier_id: z.uuid("Supplier id must be a valid UUID").optional(),
    supplier_name: z.string("Supplier name must be string").optional(),
    date: z.string("Date must be string (YYYY-MM-DD)").optional(),
    total_amount: z.number("Total amount must be a number").optional(),
    discount_amount: z.number("Discount amount must be a number").optional(),
    net_amount: z.number("Net amount must be a number").optional(),
    paid_amount: z.number("Paid amount must be a number").optional(),
    due_amount: z.number("Due amount must be a number").optional(),
    shipping_status: z.enum([ShippingStatus.pending, ShippingStatus.partial, ShippingStatus.received], "Invalid shipping status").optional(),
    notes: z.string("Notes must be string").optional(),
});

export const receivePurchaseItemZodSchema = z.object({
    purchase_item_id: z.uuid("Purchase item id must be a valid UUID"),
    receive_date: z.string("Receive date must be string (YYYY-MM-DD)").min(1, "Receive date is required"),
    receiver_name: z.string("Receiver name must be string").min(1, "Receiver name is required"),
    received_qty: z.number("Received qty must be a number").int().positive("Received qty must be positive"),
    condition: z.enum([ReceiveCondition.good, ReceiveCondition.damaged, ReceiveCondition.partial], "Invalid condition").optional(),
    notes: z.string("Notes must be string").optional(),
});

export const updateReceiveZodSchema = z.object({
    received_qty: z.number("Received qty must be a number").int().nonnegative(),
});

export type ICreatePurchasePayload = z.infer<typeof createPurchaseZodSchema>;
export type IUpdatePurchasePayload = z.infer<typeof updatePurchaseZodSchema>;
export type IReceivePurchaseItemPayload = z.infer<typeof receivePurchaseItemZodSchema>;
