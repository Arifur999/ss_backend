import z from "zod";
import {
    DamageAction,
    DamageReceiveResult,
    DamageSource,
} from "../../../generated/prisma/enums.js";
import { needsSupplier, type DamageActionValue, type DamageSourceValue } from "../../shared/damageStatus.js";

const damageItemZodSchema = z.object({
    product_id: z.uuid("Product id must be a valid UUID"),
    product_code: z.string("Product code must be string").optional(),
    product_name: z.string("Product name must be string").min(1, "Product name is required"),
    qty: z.number("Qty must be a number").int("Qty must be a whole number").positive("Qty must be positive"),
    /**
     * What one unit is worth, if the operator wants to say.
     *
     * Left out or zero, the server draws it FIFO from the batches, which is
     * the normal case and the point of the module. It is worth accepting
     * because the draw can come up empty - damaging a piece the batch table
     * has no record of - and then FIFO has no price to offer and a typed one
     * is the only honest figure available.
     */
    unit_cost: z.number("Unit cost must be a number").nonnegative("Unit cost cannot be negative").optional(),
});

// The three fields the supplier rule reads, shared by create and update so the
// refine below can be written once.
const supplierShape = {
    source: z.enum([DamageSource.own_stock, DamageSource.supplier], "Invalid source").optional(),
    action: z.enum([DamageAction.repair, DamageAction.return, DamageAction.exchange], "Invalid action").optional(),
    supplier_id: z.uuid("Supplier id must be a valid UUID").nullable().optional(),
    supplier_name: z.string("Supplier name must be string").optional(),
};

/**
 * Own-stock repair is the only combination that may leave the supplier blank -
 * see needsSupplier. Checked against the DEFAULTS the schema would apply, so a
 * payload that omits `action` is judged as the `repair` it will become rather
 * than slipping through unexamined.
 */
const hasRequiredSupplier = (payload: {
    source?: DamageSourceValue;
    action?: DamageActionValue;
    supplier_id?: string | null;
}) => {
    const source = payload.source ?? "own_stock";
    const action = payload.action ?? "repair";
    return !needsSupplier(source, action) || Boolean(payload.supplier_id);
};

const supplierRefineMessage = {
    message: "Choose the supplier this is going back to",
    path: ["supplier_id"],
};

export const createDamageZodSchema = z
    .object({
        // Optional: the server generates one when it is left out, and resolves
        // a collision rather than refusing the save.
        doc_no: z.string("Doc no must be string").optional(),
        date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
        ...supplierShape,
        notes: z.string("Notes must be string").optional(),
        items: z.array(damageItemZodSchema).min(1, "At least one item is required"),
    })
    .refine(hasRequiredSupplier, supplierRefineMessage);

export const updateDamageZodSchema = z
    .object({
        doc_no: z.string("Doc no must be string").optional(),
        date: z.string("Date must be string (YYYY-MM-DD)").optional(),
        ...supplierShape,
        notes: z.string("Notes must be string").optional(),
    })
    .refine((payload) => Object.keys(payload).length > 0, { message: "Nothing to update" });

export const receiveDamageItemZodSchema = z.object({
    damage_item_id: z.uuid("Damage item id must be a valid UUID"),
    receive_date: z.string("Receive date must be string (YYYY-MM-DD)").min(1, "Receive date is required"),
    receiver_name: z
        .string("Receiver name must be string")
        .nullable()
        .optional()
        .transform((value) => value ?? ""),
    received_qty: z
        .number("Received qty must be a number")
        .int("Received qty must be a whole number")
        .positive("Received qty must be positive"),
    result: z.enum(
        [DamageReceiveResult.repaired, DamageReceiveResult.replaced, DamageReceiveResult.scrapped],
        "Invalid result"
    ),
    notes: z.string("Notes must be string").optional(),
});

export type ICreateDamagePayload = z.infer<typeof createDamageZodSchema>;
export type IUpdateDamagePayload = z.infer<typeof updateDamageZodSchema>;
export type IReceiveDamageItemPayload = z.infer<typeof receiveDamageItemZodSchema>;

/**
 * A repair paid out, or a refund the supplier paid back.
 *
 * `kind` picks which table the row lands in - expenses or other_incomes - so
 * the Damage Transactions page can write both without two endpoints. Both
 * require an account: real money moves here, unlike the write-off on a scrap,
 * which has no account because no cash left the till.
 */
export const damageTransactionZodSchema = z.object({
    kind: z.enum(["repair_cost", "supplier_refund"], "Invalid transaction kind"),
    date: z.string("Date must be string (YYYY-MM-DD)").min(1, "Date is required"),
    amount: z.number("Amount must be a number").positive("Amount must be more than zero"),
    account_id: z.uuid("Choose the account the money moved through"),
    account_name: z.string("Account name must be string").optional(),
    category_id: z.uuid("Category id must be a valid UUID").optional(),
    category_name: z.string("Category name must be string").optional(),
    notes: z.string("Notes must be string").optional(),
});

export type IDamageTransactionPayload = z.infer<typeof damageTransactionZodSchema>;
