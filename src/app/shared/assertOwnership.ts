import status from "http-status";
import AppError from "../errorHelpers/AppError.js";
import { prisma } from "../lib/prisma.js";

// Confirms that an id the client sent points at a row in their own workspace.
//
// Reads, updates and deletes already scope every query by owner_id, so this is
// about the one direction that did not: a foreign key supplied when CREATING a
// row. Nothing checked that a supplier_id or product_id in the request belonged
// to the caller, and the id is the only thing needed to link to it - so posting
// another workspace's supplier id attached their supplier to your product, and
// the response (which includes the supplier) handed back their name, phone and
// address.
//
// This only ever rejects a reference that was already wrong. A create that used
// the caller's own records - which is every create the app itself makes - is
// unaffected, so no existing figure changes.
export const assertOwnedRecord = async (
    finder: () => Promise<{ id: string } | null>,
    label: string
): Promise<void> => {
    const found = await finder();
    if (!found) {
        // Deliberately the same message an unknown id would produce: whether
        // the row exists in someone else's workspace is not the caller's
        // business to learn.
        throw new AppError(status.NOT_FOUND, `${label} not found`);
    }
};

/**
 * Every kind of row another table can point at, and how to look one up.
 *
 * Keeping the lookups here rather than at each call site is what made it
 * practical to cover all of them: the checks were written one service at a time
 * and only two of about fifteen create paths ever got one.
 */
const REFERENCE_LOOKUPS = {
    account: { label: "Account", find: (id: string, ownerId: string) => prisma.account.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    customer: { label: "Customer", find: (id: string, ownerId: string) => prisma.customer.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    supplier: { label: "Supplier", find: (id: string, ownerId: string) => prisma.supplier.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    product: { label: "Product", find: (id: string, ownerId: string) => prisma.product.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    employee: { label: "Employee", find: (id: string, ownerId: string) => prisma.employee.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    expenseCategory: { label: "Expense category", find: (id: string, ownerId: string) => prisma.expenseCategory.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    shareholder: { label: "Shareholder", find: (id: string, ownerId: string) => prisma.shareholder.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    loanLender: { label: "Bank / person", find: (id: string, ownerId: string) => prisma.loanLender.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    sale: { label: "Sale", find: (id: string, ownerId: string) => prisma.sale.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
    purchase: { label: "Purchase", find: (id: string, ownerId: string) => prisma.purchase.findFirst({ where: { id, owner_id: ownerId }, select: { id: true } }) },
} as const;

export type OwnedReferenceKind = keyof typeof REFERENCE_LOOKUPS;

/**
 * Check every foreign key in a create/update payload at once.
 *
 * Reads, updates and deletes all scope by owner_id already. The gap was always
 * the ids supplied when WRITING a row: the id is the only thing needed to link
 * to a record, so posting another workspace's account_id or customer_id attached
 * their row to your transaction - and any response that joins it handed their
 * details back.
 *
 * Absent, null and empty-string values are skipped, so an optional reference
 * stays optional. Only a reference that was already wrong is ever rejected, which
 * is why applying this changes no existing figure: every write the app itself
 * makes uses the caller's own records.
 *
 * @example
 *   await assertOwnedReferences(payload, user.ownerId, {
 *       account_id: "account",
 *       category_id: "expenseCategory",
 *   });
 */
export const assertOwnedReferences = async (
    payload: Record<string, unknown>,
    ownerId: string,
    spec: Record<string, OwnedReferenceKind>
): Promise<void> => {
    for (const [field, kind] of Object.entries(spec)) {
        const value = payload[field];
        if (value === null || value === undefined || value === "") continue;

        const lookup = REFERENCE_LOOKUPS[kind];
        await assertOwnedRecord(() => lookup.find(String(value), ownerId), lookup.label);
    }
};
