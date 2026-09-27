// ---------------------------------------------------------------------------
// The two rules a damage entry lives by: when it is finished, and whether what
// came back belongs in stock again.
//
// Kept here rather than in the service so both can be tested - CI has no .env,
// and a test that reaches config/env.ts fails there. The string unions are
// written out instead of imported from the generated Prisma enums so this file
// depends on nothing at all.
// ---------------------------------------------------------------------------

export type DamageStatusValue = "pending" | "partial" | "completed";
export type DamageReceiveResultValue = "repaired" | "replaced" | "scrapped";

/** One line's progress, as the status rule sees it. */
export interface DamageLineProgress {
    qty: unknown;
    received_qty: unknown;
}

/**
 * Where an entry stands once its lines are counted.
 *
 * Deliberately the same three-way shape as refreshShippingStatus in
 * purchase.service.ts, because an operator reading both screens should not
 * have to learn two vocabularies for the same idea.
 *
 * An entry with no lines is `pending`, not `completed`: nothing has come back
 * because nothing went out, and calling that finished would hide a half-made
 * entry from the Receive page.
 */
export const nextDamageStatus = (lines: DamageLineProgress[]): DamageStatusValue => {
    if (lines.length === 0) return "pending";

    const rows = lines.map((line) => ({
        qty: Math.max(0, Math.trunc(Number(line.qty) || 0)),
        received: Math.max(0, Math.trunc(Number(line.received_qty) || 0)),
    }));

    if (rows.every((row) => row.received >= row.qty)) return "completed";
    if (rows.some((row) => row.received > 0)) return "partial";
    return "pending";
};

/**
 * Whether a receive puts the goods back on the shelf.
 *
 * `scrapped` is the whole reason this is a decision rather than an assumption:
 * a piece can come back from the repairer beyond saving, and adding it to
 * available_qty because it physically returned would put something unsellable
 * into stock - and then into a FIFO batch, where a later sale would be costed
 * against goods that cannot be delivered.
 */
export const returnsStock = (result: DamageReceiveResultValue): boolean =>
    result === "repaired" || result === "replaced";

export type DamageSourceValue = "own_stock" | "supplier";
export type DamageActionValue = "repair" | "return" | "exchange";

/**
 * Whether this entry has to name a supplier.
 *
 * Three of the six combinations point at one: goods that ARRIVED broken came
 * from somebody, and goods being returned or exchanged are going back to
 * somebody. Only own-stock repair is free of it - a chair broken in the
 * showroom usually goes to a local carpenter who is not a supplier at all, and
 * forcing a supplier there would have the operator inventing one.
 *
 * Exported rather than inlined in the Zod refine so the form can grey the
 * field out by the same rule the server rejects by, the way
 * needsExpenseCategory does for loan profit.
 */
export const needsSupplier = (source: DamageSourceValue, action: DamageActionValue): boolean =>
    source === "supplier" || action === "return" || action === "exchange";
