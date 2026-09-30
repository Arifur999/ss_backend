import { PAGE_PERMISSIONS, sanitizePermissions } from "./permissions.js";

// ---------------------------------------------------------------------------
// Translating the old permission vocabulary into the menu-shaped one.
//
// Why this has to exist at all: sanitizePermissions drops any name this build
// does not recognise, and an empty array means "everything the role allows". So
// the moment the legacy tail is removed from PERMISSIONS, every user whose ticks
// have not been translated is SILENTLY WIDENED to their full role - no error, no
// log, nothing to notice. The two failure modes are not symmetric:
//
//   no mapping   - a restricted user quietly gains their whole role, and it is
//                  found out when something goes wrong, or never
//   a mapping    - somebody is narrowed too far, says "I cannot open X", and the
//                  owner ticks one box
//
// One is silent and permanent, the other is loud and takes thirty seconds to
// undo. So: map.
//
// ---------------------------------------------------------------------------
// The bias: generous on pages, strict on delete
// ---------------------------------------------------------------------------
// The old vocabulary could not say "not this page". A View + Add + Edit trio was
// a statement about a whole AREA of the app, so expanding it to that area's pages
// is a faithful translation rather than an escalation - the user could already
// reach every one of those screens, because the old table only ever gated the
// sidebar and the sidebar only named a handful of them.
//
// "Delete X" maps one-for-one onto that group's delete tick, or is dropped where
// no such tick exists (Balance, Shareholders, Loans, Expenses and Inventory
// delete under checkAuth(Role.owner), so a tick there would grant nothing).
//
// page:dashboard.overview is added unconditionally, because everybody could open
// "/" before. Taking the landing page away from somebody would read as a broken
// deploy, not as a permission change.
//
// Pure on purpose - no Prisma, no env - so the table can be tested in CI, where
// there is no .env file. src/scripts/migratePermissions.ts is the part that touches
// the database.
// ---------------------------------------------------------------------------

/** Everyone could open "/" before this change. Nobody loses it here. */
export const ALWAYS_GRANTED = "page:dashboard.overview";

/**
 * Old name -> new names.
 *
 * An empty array means "this granted nothing that survives". Four of those -
 * Discount, Business Settings, User Management, Marketing SMS - were enforced
 * nowhere in the first place: no route ever asked for them, so unticking one
 * never stopped anybody doing anything. Recycle Bin goes because the whole Admin
 * menu is owner-only by role now, and Delete Expense goes because deleting an
 * expense was always owner-only anyway.
 */
export const LEGACY_MAP: Record<string, string[]> = {
    // ---- Sales -------------------------------------------------------------
    "View Sales": ["page:sales.ledger", "page:sales.history"],
    "Edit Sale": ["page:sales.ledger", "page:sales.history"],
    "New Sale": ["page:sales.new", "page:sales.drafts"],
    "Delete Sale": ["act:sales.delete"],
    "Discount": [],

    // ---- Purchase ----------------------------------------------------------
    "View Purchase": ["page:purchase.ledger", "page:purchase.history"],
    "Add Purchase": ["page:purchase.orders", "page:purchase.drafts"],
    "Edit Purchase": ["page:purchase.orders", "page:purchase.drafts"],
    "Delete Purchase": ["act:purchase.delete"],
    "Receive Stock": ["page:purchase.received"],

    // ---- Damage ------------------------------------------------------------
    "View Damage": ["page:damage.dashboard", "page:damage.entries", "page:damage.transactions"],
    "Add Damage": ["page:damage.dashboard", "page:damage.entries", "page:damage.transactions"],
    "Edit Damage": ["page:damage.dashboard", "page:damage.entries", "page:damage.transactions"],
    "Receive Damage": ["page:damage.receive"],
    "Delete Damage": ["act:damage.delete"],

    // ---- Due management ----------------------------------------------------
    "View Due": ["page:customers.due-received", "page:customers.ledger"],
    "Add Due": ["page:customers.due-received", "page:customers.ledger"],
    "Edit Due": ["page:customers.due-received", "page:customers.ledger"],
    "Delete Due": ["act:customers.delete"],

    // ---- Expenses ----------------------------------------------------------
    // Adding and editing both happen on the Transactions screen. Somebody who
    // had "Add Expense" without "View Expense" was not meant to be reading the
    // totals on the Overview, so they do not get it here.
    "View Expense": ["page:expenses.overview", "page:expenses.transactions"],
    "Add Expense": ["page:expenses.transactions"],
    "Edit Expense": ["page:expenses.transactions"],
    "Delete Expense": [],

    // ---- Contacts ----------------------------------------------------------
    "View Customer": ["page:customers.list", "page:customers.dashboard"],
    "Add Customer": ["page:customers.list", "page:customers.dashboard"],
    "Edit Customer": ["page:customers.list", "page:customers.dashboard"],
    "Delete Customer": ["act:customers.delete"],

    "View Supplier": ["page:supplier.dashboard", "page:supplier.report", "page:supplier.list"],
    "Add Supplier": ["page:supplier.dashboard", "page:supplier.report", "page:supplier.list"],
    "Edit Supplier": ["page:supplier.dashboard", "page:supplier.report", "page:supplier.list"],
    "Delete Supplier": ["act:supplier.delete"],

    "View Employee": ["page:employees.dashboard", "page:employees.list", "page:employees.transactions"],
    "Add Employee": ["page:employees.dashboard", "page:employees.list", "page:employees.transactions"],
    "Edit Employee": ["page:employees.dashboard", "page:employees.list", "page:employees.transactions"],
    "Delete Employee": ["act:employees.delete"],

    // ---- Inventory / products ---------------------------------------------
    "Product List": ["page:products.list"],
    "Add Product": ["page:products.list"],
    "Edit Product": ["page:products.list"],
    "Delete Product": ["act:products.delete"],
    "Stock Update": ["page:inventory.stock", "page:products.update-price"],
    "Stock History": ["page:inventory.stock"],

    // ---- Money -------------------------------------------------------------
    /**
     * The one place the old vocabulary DID separate reading from writing, so this
     * has to as well.
     *
     * "View Balance" and "Account Transfer" were two different ticks, and
     * POST /account-transfers required the second one. Mapping both onto the same
     * four pages would hand the Balance Transfer screen to everybody who could
     * merely look at the balances - which is a real escalation, and the kind this
     * whole change is supposed to be removing rather than adding.
     */
    "View Balance": ["page:balance.overview", "page:balance.ledger", "page:balance.wallet"],
    "Account Transfer": ["page:balance.overview", "page:balance.ledger", "page:balance.wallet", "page:balance.transfer"],
    "View Shareholders": [
        "page:shareholders.dashboard", "page:shareholders.invest",
        "page:shareholders.profit", "page:shareholders.list",
    ],
    "Profit Withdrawal": [
        "page:shareholders.dashboard", "page:shareholders.invest",
        "page:shareholders.profit", "page:shareholders.list",
    ],
    "View Loans": ["page:loans.dashboard", "page:loans.lenders", "page:loans.transactions", "page:loans.ledger"],
    "Manage Loans": ["page:loans.dashboard", "page:loans.lenders", "page:loans.transactions", "page:loans.ledger"],

    // ---- Reports & system --------------------------------------------------
    "View Reports": [
        "page:reports.summary", "page:reports.yearly",
        "page:reports.monthly-target", "page:reports.purchase-target",
    ],
    "Marketing SMS": ["page:marketing.campaign", "page:marketing.buy-sms"],
    "Business Settings": [],
    "User Management": [],
    "Recycle Bin": [],
};

/** Whether this array still speaks the old vocabulary. */
export const needsMigration = (permissions: readonly string[]): boolean => {
    if (permissions.length === 0) return false;
    if (permissions.some((name) => name.startsWith("page:") || name.startsWith("act:"))) return false;
    return permissions.some((name) => name in LEGACY_MAP);
};

/**
 * What this user's ticks become.
 *
 * Runs the result through sanitizePermissions so the orphan-delete rule applies
 * here too: "Delete Sale" alone translates to act:sales.delete alone, which the
 * server would refuse to store, so it is trimmed here rather than written and
 * silently dropped on the next save.
 *
 * An EMPTY input returns empty. That is not an oversight - empty means
 * "everything the role allows", and filling it in would take access away from
 * every user who has never had a box ticked, which is almost all of them.
 */
export const migratePermissionList = (permissions: readonly string[]): string[] => {
    if (permissions.length === 0) return [];

    const out = new Set<string>([ALWAYS_GRANTED]);
    for (const legacy of permissions) {
        // Already translated, or a name from a future build: keep it as it is.
        if (legacy.startsWith("page:") || legacy.startsWith("act:")) {
            out.add(legacy);
            continue;
        }
        for (const name of LEGACY_MAP[legacy] ?? []) out.add(name);
    }

    // Menu order, not insertion order, so a printed diff is readable.
    const ordered = [...out].sort((left, right) => {
        const leftPage = PAGE_PERMISSIONS.indexOf(left as never);
        const rightPage = PAGE_PERMISSIONS.indexOf(right as never);
        if (leftPage !== -1 && rightPage !== -1) return leftPage - rightPage;
        if (leftPage !== -1) return -1;
        if (rightPage !== -1) return 1;
        return left.localeCompare(right);
    });

    return sanitizePermissions(ordered);
};
