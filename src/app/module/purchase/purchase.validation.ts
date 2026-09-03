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

/**
 * A line added to a purchase that already exists.
 *
 * Same shape as a line on a new purchase, minus received_qty: something being
 * added now has not been received, and letting a caller claim otherwise would
 * put stock in the ledger that never arrived and has no FIFO batch behind it.
 */
export const addPurchaseItemZodSchema = purchaseItemZodSchema.omit({ received_qty: true });

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
    // Receiver name is optional - a product can be received without naming who
    // took delivery (defaults to empty in the service).
    receiver_name: z.string("Receiver name must be string").nullable().optional().transform((value) => value ?? ""),
    received_qty: z.number("Received qty must be a number").int().positive("Received qty must be positive"),
    condition: z.enum([ReceiveCondition.good, ReceiveCondition.damaged, ReceiveCondition.partial], "Invalid condition").optional(),
    notes: z.string("Notes must be string").optional(),
});

/**
 * Editing one purchase line from the Purchase Ledger.
 *
 * The route had no schema and the service whitelisted field NAMES only, so
 * qty: -5 wrote through. A negative qty then made allReceived (received_qty >= qty)
 * true and flipped the whole purchase to 'received', while the stock query's
 * SUM(pi.qty) and GREATEST(0, qty - received) computed off the negative number -
 * putting the entire product's stock page wrong. Reachable through the data-layer
 * shim, which maps purchase_items.update to this route.
 */
export const updatePurchaseItemZodSchema = z.object({
    product_code: z.string("Product code must be string").optional(),
    product_name: z.string("Product name must be string").optional(),
    dp_price: z.number("DP price must be a number").nonnegative("DP price cannot be negative").optional(),
    discount_pct: z.number("Discount pct must be a number").min(0).max(100).optional(),
    actual_dp: z.number("Actual DP must be a number").nonnegative("Actual DP cannot be negative").optional(),
    qty: z.number("Qty must be a number").int().positive("Qty must be at least 1").optional(),
    total_amount: z.number("Total amount must be a number").nonnegative("Total amount cannot be negative").optional(),
    sp_pct: z.number("SP pct must be a number").min(0).max(100).optional(),
    sp_amount: z.number("SP amount must be a number").nonnegative("SP amount cannot be negative").optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
    message: "Nothing to update",
});

/**
 * Setting a purchase line's total received quantity directly.
 *
 * received_qty came off the body through Number() with no floor, and the service
 * applies the delta to inventory.available_qty with no clamp - so a negative value
 * drove the stock level down without a matching batch reduction, leaving the FIFO
 * layers and the inventory level permanently disagreeing. A non-numeric one became
 * NaN and reached the database.
 */
export const setItemReceivedQtyZodSchema = z.object({
    received_qty: z.number("Received qty must be a number").int().nonnegative("Received qty cannot be negative"),
});

export const updateReceiveZodSchema = z.object({
    received_qty: z.number("Received qty must be a number").int().nonnegative(),
});

export type ICreatePurchasePayload = z.infer<typeof createPurchaseZodSchema>;
export type IAddPurchaseItemPayload = z.infer<typeof addPurchaseItemZodSchema>;
export type IUpdatePurchasePayload = z.infer<typeof updatePurchaseZodSchema>;
export type IReceivePurchaseItemPayload = z.infer<typeof receivePurchaseItemZodSchema>;

export type IUpdatePurchaseItemPayload = z.infer<typeof updatePurchaseItemZodSchema>;
export type ISetItemReceivedQtyPayload = z.infer<typeof setItemReceivedQtyZodSchema>;

/**
 * Receive every outstanding line on a purchase at once.
 *
 * No quantities: it receives exactly what is still outstanding on each line, so
 * calling it twice is not a double receive.
 */
export const receiveAllZodSchema = z.object({
    receive_date: z.string("Receive date must be string (YYYY-MM-DD)").min(1, "Receive date is required"),
    receiver_name: z.string("Receiver name must be string").nullable().optional().transform((value) => value ?? ""),
    notes: z.string("Notes must be string").optional(),
});

export type IReceiveAllPayload = z.infer<typeof receiveAllZodSchema>;
