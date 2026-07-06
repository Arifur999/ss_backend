import z from "zod";
import { SaleStatus } from "../../../generated/prisma/enums.js";

const saleItemZodSchema = z.object({
    product_id: z.uuid("Product id must be a valid UUID"),
    product_code: z.string("Product code must be string"),
    product_name: z.string("Product name must be string"),
    selling_price: z.number("Selling price must be a number").nonnegative().optional(),
    discount_pct: z.number("Discount pct must be a number").optional(),
    actual_price: z.number("Actual price must be a number").nonnegative().optional(),
    qty: z.number("Qty must be a number").int().positive(),
    total_amount: z.number("Total amount must be a number").nonnegative().optional(),
    cost_price: z.number("Cost price must be a number").nonnegative().optional(),
    delivered_qty: z.number("Delivered qty must be a number").int().nonnegative().optional(),
    manual_cost: z.boolean("manual_cost must be a boolean").optional(),
});

const salePaymentZodSchema = z.object({
    date: z.string("Date must be string (YYYY-MM-DD)").optional(),
    account_id: z.uuid("Account id must be a valid UUID"),
    account_name: z.string("Account name must be string").optional(),
    amount: z.number("Amount must be a number").positive("Payment amount must be positive"),
});

export const createSaleZodSchema = z.object({
    invoice_no: z.string("Invoice no must be string").min(1, "Invoice no is required"),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    customer_id: z.uuid("Customer id must be a valid UUID").nullable().optional(),
    customer_name: z.string("Customer name must be string").min(1, "Customer name is required"),
    customer_phone: z.string("Customer phone must be string").optional(),
    customer_address: z.string("Customer address must be string").optional(),
    subtotal: z.number("Subtotal must be a number").nonnegative().optional(),
    discount_amount: z.number("Discount amount must be a number").optional(),
    net_amount: z.number("Net amount must be a number").nonnegative().optional(),
    paid_amount: z.number("Paid amount must be a number").nonnegative().optional(),
    due_amount: z.number("Due amount must be a number").optional(),
    account_id: z.uuid("Account id must be a valid UUID").nullable().optional(),
    account_name: z.string("Account name must be string").optional(),
    notes: z.string("Notes must be string").optional(),
    status: z.enum([SaleStatus.draft, SaleStatus.completed, SaleStatus.cancelled], "Invalid status").optional(),
    items: z.array(saleItemZodSchema).min(1, "At least one item is required"),
    payments: z.array(salePaymentZodSchema).optional(),
});

export const updateSaleZodSchema = createSaleZodSchema;

export const createSaleDeliveryZodSchema = z.object({
    sale_item_id: z.uuid("Sale item id must be a valid UUID"),
    delivery_date: z.string("Delivery date must be string (YYYY-MM-DD)").min(1, "Delivery date is required"),
    delivered_qty: z.number("Delivered qty must be a number").int().positive(),
    delivered_by: z.string("Delivered by must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export type ICreateSalePayload = z.infer<typeof createSaleZodSchema>;
export type ICreateSaleDeliveryPayload = z.infer<typeof createSaleDeliveryZodSchema>;
export type ISaleItemPayload = z.infer<typeof saleItemZodSchema>;
export type ISalePaymentPayload = z.infer<typeof salePaymentZodSchema>;
