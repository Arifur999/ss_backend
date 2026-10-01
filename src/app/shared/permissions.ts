/**
 * What a team member is allowed to do, beyond what their role already allows.
 *
 * Two layers, and the order matters:
 *
 *   1. Role  (checkAuth)         - the outer gate. An owner-only route is
 *                                  owner-only no matter what is ticked here.
 *   2. Permission (this file)    - narrows WITHIN a role.
 *
 * The mirror of Hatim/src/lib/permissions.ts. Read that file first: it carries
 * the reasoning for the menu-shaped vocabulary, the two prefixes, and why there
 * are nine delete ticks rather than fourteen. PERMISSION_FINGERPRINT below is
 * asserted in both repos' tests so the two lists cannot drift apart silently.
 *
 * ---------------------------------------------------------------------------
 * The rule for an empty list
 * ---------------------------------------------------------------------------
 * A user with NO permissions stored gets everything their role allows. That is
 * what makes this safe to deploy to a live system: every existing team member
 * has an empty column on the morning of the upgrade, and nobody loses access to
 * anything. Restrictions only start applying to a user once somebody has
 * actually ticked boxes for them.
 *
 * An owner always bypasses. Locking an owner out of their own workspace with a
 * checkbox is never the intent, and there would be no way back.
 */

/**
 * Every page a permission can open. Mirrors PERMISSION_GROUPS in the frontend,
 * in the same order, which is sidebar order.
 */
export const PAGE_PERMISSIONS = [
    "page:dashboard.overview",

    "page:balance.overview",
    "page:balance.transfer",
    "page:balance.ledger",
    "page:balance.wallet",

    "page:shareholders.dashboard",
    "page:shareholders.invest",
    "page:shareholders.profit",
    "page:shareholders.list",

    "page:loans.dashboard",
    "page:loans.lenders",
    "page:loans.transactions",
    "page:loans.ledger",

    "page:expenses.overview",
    "page:expenses.transactions",

    "page:products.list",
    "page:products.update-price",

    "page:supplier.dashboard",
    "page:supplier.report",
    "page:supplier.payments",
    "page:supplier.other-income",
    "page:supplier.list",

    "page:purchase.orders",
    "page:purchase.drafts",
    "page:purchase.ledger",
    "page:purchase.received",
    "page:purchase.history",

    "page:inventory.stock",

    "page:damage.dashboard",
    "page:damage.entries",
    "page:damage.receive",
    "page:damage.transactions",

    "page:sales.new",
    "page:sales.drafts",
    "page:sales.ledger",
    "page:sales.history",

    "page:customers.dashboard",
    "page:customers.list",
    "page:customers.due-received",
    "page:customers.ledger",

    "page:reports.summary",
    "page:reports.yearly",
    "page:reports.monthly-target",
    "page:reports.purchase-target",

    "page:marketing.campaign",
    "page:marketing.buy-sms",

    "page:employees.dashboard",
    "page:employees.list",
    "page:employees.transactions",
    "page:employees.attendance",
] as const;

/**
 * The nine delete ticks.
 *
 * Only where a non-owner can actually reach a DELETE endpoint. Balance,
 * Shareholders, Loans and Expenses delete under checkAuth(Role.owner) and
 * Inventory has no delete at all, so a tick for those could never change an
 * outcome - see the frontend file for the argument.
 */
export const DELETE_PERMISSIONS = [
    "act:products.delete",
    "act:supplier.delete",
    "act:purchase.delete",
    "act:damage.delete",
    "act:sales.delete",
    "act:customers.delete",
    "act:reports.delete",
    "act:marketing.delete",
    "act:employees.delete",
] as const;

/**
 * The previous, action-shaped vocabulary. DEPRECATED - remove after the
 * migration is confirmed in production.
 *
 * These are kept accepted for exactly one release, and for one reason:
 * sanitizePermissions drops any name this build does not know, and an empty
 * array means "everything the role allows". So the moment the new list ships,
 * every user whose ticks have not yet been translated by
 * src/scripts/migratePermissions.ts would be SILENTLY WIDENED to their full role -
 * no error, no log, nothing to notice. Keeping the old names valid closes that
 * window: an owner saving a user mid-deploy does not lose their old ticks, and
 * the migration can run when somebody is watching.
 *
 * Nothing new may reference these. The frontend never offers them, so they
 * cannot be ticked - they can only survive a save.
 *
 * Removal checklist: run the migration, confirm no row still holds one of these
 * (SELECT id FROM users WHERE permissions && ARRAY[...]), then delete this
 * block, its entry in PERMISSIONS, and the assertion in permissions.test.ts.
 */
export const LEGACY_PERMISSIONS = [
    "View Purchase", "Add Purchase", "Edit Purchase", "Delete Purchase", "Receive Stock",
    "View Damage", "Add Damage", "Edit Damage", "Delete Damage", "Receive Damage",
    "View Sales", "New Sale", "Edit Sale", "Delete Sale", "Discount",
    "View Due", "Add Due", "Edit Due", "Delete Due",
    "View Expense", "Add Expense", "Edit Expense", "Delete Expense",
    "View Customer", "Add Customer", "Edit Customer", "Delete Customer",
    "View Supplier", "Add Supplier", "Edit Supplier", "Delete Supplier",
    "View Employee", "Add Employee", "Edit Employee", "Delete Employee",
    "Product List", "Add Product", "Edit Product", "Delete Product", "Stock Update", "Stock History",
    "View Balance", "Account Transfer", "View Shareholders", "Profit Withdrawal", "View Loans", "Manage Loans",
    "View Reports", "Business Settings", "User Management", "Marketing SMS", "Recycle Bin",
] as const;

/** Every permission that maps to a feature this app actually has. */
export const PERMISSIONS = [...PAGE_PERMISSIONS, ...DELETE_PERMISSIONS, ...LEGACY_PERMISSIONS] as const;

export type PagePermission = (typeof PAGE_PERMISSIONS)[number];
export type DeletePermission = (typeof DELETE_PERMISSIONS)[number];
export type Permission = (typeof PERMISSIONS)[number];

/** What the current vocabulary is worth without the deprecated tail. */
export const CURRENT_PERMISSIONS = [...PAGE_PERMISSIONS, ...DELETE_PERMISSIONS] as const;

/**
 * A digest of a permission vocabulary: how many names, and a hash of them.
 *
 * FNV-1a, character for character the same function as the frontend's, so the
 * two can be compared by eye across two repos that share no build.
 */
export const fingerprintPermissions = (names: readonly string[]): string => {
    const joined = [...names].sort().join("\n");
    let hash = 0x811c9dc5;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${names.length}-${hash.toString(16).padStart(8, "0")}`;
};

/**
 * What the vocabulary hashes to right now. The same literal is asserted in
 * Hatim/src/lib/permissions.test.ts.
 *
 * Computed over CURRENT_PERMISSIONS, NOT over PERMISSIONS - the legacy tail is
 * this repo's transitional business and the frontend has never heard of it, so
 * including it would make the two numbers differ by design and the check
 * worthless.
 *
 * When this fails, check the OTHER repo before editing the number.
 */
export const PERMISSION_FINGERPRINT = fingerprintPermissions(CURRENT_PERMISSIONS);

/**
 * Which pages display a given table's rows.
 *
 * A list endpoint cannot be gated by "the page that owns it", because almost
 * none of them has one. GET /accounts feeds sixteen screens - every page with a
 * payment-method dropdown - and gating it behind View Balance, as it was, meant
 * any staff member with a single tick got an empty dropdown on the Sales page
 * and no error, because the frontend shim turns a 403 into an empty array.
 *
 * So a read is gated by the union of the pages that show those rows, and the
 * unions live here rather than being spelled out across twenty route files.
 * Spread at the call site: requirePermission(...READS.accounts).
 *
 * Backend-only. The frontend has no use for it, which keeps the mirrored
 * surface at exactly the names in CURRENT_PERMISSIONS.
 *
 * NOT in here on purpose: the tables the Dashboard aggregates. Nearly every
 * user holds page:dashboard.overview, so listing it in these unions would hand
 * every staff member raw GET /sales and GET /expenses - the exact hole this
 * work exists to close. The Dashboard gets its totals from
 * GET /reports/dashboard-summary instead, which computes them server-side and
 * omits the blocks the caller may not see.
 */
export const READS = {
    /** Sixteen pages: every screen with a payment-method dropdown. */
    accounts: [
        "page:balance.overview", "page:balance.transfer", "page:balance.ledger", "page:balance.wallet",
        "page:sales.new", "page:sales.drafts", "page:sales.ledger", "page:sales.history",
        "page:purchase.orders", "page:purchase.drafts", "page:purchase.ledger",
        "page:supplier.payments", "page:supplier.other-income",
        "page:customers.due-received", "page:customers.ledger",
        "page:expenses.overview", "page:expenses.transactions",
        "page:employees.transactions",
        "page:damage.transactions",
        "page:shareholders.invest", "page:shareholders.profit",
        "page:loans.transactions", "page:loans.ledger",
        "page:reports.summary", "page:reports.yearly",
    ],
    accountTransfers: [
        "page:balance.transfer", "page:balance.ledger", "page:balance.overview", "page:balance.wallet",
    ],
    /** One stock figure, four endpoints that used to be gated inconsistently. */
    inventory: [
        "page:inventory.stock",
        "page:products.list", "page:products.update-price",
        "page:sales.new", "page:sales.drafts",
        "page:purchase.orders", "page:purchase.received",
        "page:damage.entries", "page:damage.receive",
        "page:reports.summary", "page:reports.yearly",
        "page:sales.ledger",
    ],
    products: [
        "page:products.list", "page:products.update-price",
        "page:inventory.stock",
        "page:sales.new", "page:sales.drafts", "page:sales.ledger", "page:sales.history",
        "page:purchase.orders", "page:purchase.drafts", "page:purchase.received", "page:purchase.history",
        "page:damage.entries", "page:damage.receive", "page:damage.transactions",
        "page:reports.summary", "page:reports.yearly",
        "page:purchase.ledger",
    ],
    priceUpdates: [
        "page:products.update-price", "page:products.list",
        "page:reports.summary", "page:reports.yearly",
    ],
    salePayments: [
        "page:sales.ledger", "page:sales.history", "page:sales.new",
        "page:customers.due-received", "page:customers.ledger", "page:customers.dashboard",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:customers.list",
    ],
    sales: [
        "page:sales.new", "page:sales.drafts", "page:sales.ledger", "page:sales.history",
        "page:customers.dashboard", "page:customers.ledger", "page:customers.due-received",
        "page:reports.summary", "page:reports.yearly",
        "page:reports.monthly-target", "page:reports.purchase-target",
        "page:balance.overview", "page:balance.ledger", "page:shareholders.dashboard", "page:customers.list",
    ],
    purchases: [
        "page:purchase.orders", "page:purchase.drafts", "page:purchase.ledger",
        "page:purchase.received", "page:purchase.history",
        "page:supplier.dashboard", "page:supplier.report", "page:supplier.payments", "page:supplier.list",
        "page:reports.summary", "page:reports.yearly", "page:reports.purchase-target",
    ],
    /**
     * Supplier names, read by twelve pages.
     *
     * This looks like the reference list R3 leaves open, and it is NOT treated as
     * one, for a single reason: it is gated today, by "View Supplier". Opening it
     * would be this change making something reachable that was not, which is the
     * opposite of the job. A wide union is still narrower than open.
     */
    suppliers: [
        "page:supplier.dashboard", "page:supplier.report", "page:supplier.payments",
        "page:supplier.other-income", "page:supplier.list",
        "page:purchase.orders", "page:purchase.drafts", "page:purchase.ledger",
        "page:purchase.received", "page:purchase.history",
        "page:products.list", "page:products.update-price",
        "page:damage.entries", "page:damage.receive", "page:damage.transactions",
        "page:reports.summary", "page:reports.yearly", "page:reports.purchase-target",
        "page:sales.new", "page:sales.ledger", "page:marketing.campaign",
    ],
    customers: [
        "page:customers.dashboard", "page:customers.list",
        "page:customers.due-received", "page:customers.ledger",
        "page:sales.new", "page:sales.drafts", "page:sales.ledger", "page:sales.history",
        "page:marketing.campaign",
        "page:reports.summary", "page:reports.yearly",
    ],
    customerPayments: [
        "page:customers.due-received", "page:customers.ledger", "page:customers.dashboard",
        "page:sales.ledger", "page:sales.history",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:sales.new", "page:customers.list",
    ],
    expenses: [
        "page:expenses.overview", "page:expenses.transactions",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:shareholders.dashboard", "page:customers.due-received", "page:employees.transactions",
    ],
    reports: [
        "page:reports.summary", "page:reports.yearly",
        "page:reports.monthly-target", "page:reports.purchase-target",
    ],
    supplierPayments: [
        "page:supplier.payments", "page:supplier.report", "page:supplier.dashboard",
        "page:purchase.ledger", "page:purchase.history",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:purchase.orders",
    ],
    otherIncomes: [
        "page:supplier.other-income",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:shareholders.dashboard", "page:loans.transactions",
    ],
    shareholders: [
        "page:shareholders.dashboard", "page:shareholders.invest", "page:shareholders.profit", "page:shareholders.list",
        "page:reports.summary", "page:reports.yearly",
        "page:balance.overview", "page:balance.ledger",
    ],
    /** Lenders LOOKS like a reference list but carries outstanding balances. */
    loans: [
        "page:loans.dashboard", "page:loans.lenders", "page:loans.transactions", "page:loans.ledger",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
        "page:marketing.campaign",
    ],
    employees: [
        "page:employees.dashboard", "page:employees.list",
        "page:employees.transactions", "page:employees.attendance",
        "page:damage.receive", "page:customers.due-received", "page:marketing.campaign",
    ],
    salaryTransactions: [
        "page:employees.transactions", "page:employees.dashboard",
        "page:balance.overview", "page:balance.ledger",
        "page:reports.summary", "page:reports.yearly",
    ],
    /** Read by the target pages AND by the two report pages that chart them. */
    targets: [
        "page:reports.monthly-target", "page:reports.purchase-target",
        "page:reports.summary", "page:reports.yearly",
    ],
    damage: [
        "page:damage.dashboard", "page:damage.entries", "page:damage.receive", "page:damage.transactions",
        "page:reports.summary", "page:reports.yearly",
    ],
    marketing: ["page:marketing.campaign", "page:marketing.buy-sms"],
} satisfies Record<string, readonly PagePermission[]>;

const PERMISSION_SET = new Set<string>(PERMISSIONS);

/** group key -> its delete permission, for the orphan rule below. */
const DELETE_BY_GROUP = new Map<string, string>(
    DELETE_PERMISSIONS.map((name) => [name.slice("act:".length, name.lastIndexOf(".")), name])
);

const groupOf = (name: string): string => {
    const dot = name.lastIndexOf(".");
    const colon = name.indexOf(":");
    return dot > colon ? name.slice(colon + 1, dot) : "";
};

/**
 * Keep only the names this build knows about, and only ones that mean something.
 *
 * Two rules:
 *
 *   1. A permission removed in a later version stays in old rows; silently
 *      dropping it on read is better than failing the save, and better than
 *      storing a name nothing will ever check.
 *
 *   2. A delete tick with no page from the same group is dropped. requirePermission
 *      is any-of, so it cannot express "page AND delete" - which means
 *      act:sales.delete on its own would grant API-level delete on a screen the
 *      user cannot even open. The UI disables the tick until a page in that box
 *      is ticked; this is the same rule enforced where it cannot be bypassed, so
 *      it holds even for an array written with curl.
 */
export const sanitizePermissions = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const known = [
        ...new Set(values.filter((value): value is string => typeof value === "string" && PERMISSION_SET.has(value))),
    ];

    const heldGroups = new Set(known.filter((name) => name.startsWith("page:")).map(groupOf));
    return known.filter((name) => {
        if (!name.startsWith("act:")) return true;
        return heldGroups.has(groupOf(name));
    });
};

/** group key -> the box title the owner sees, for a readable 403. */
const GROUP_TITLES: Record<string, string> = {
    dashboard: "Dashboard",
    balance: "Balance",
    shareholders: "Shareholders",
    loans: "Loan Management",
    expenses: "Expenses",
    products: "Product List",
    supplier: "Supplier",
    purchase: "Purchase",
    inventory: "Inventory",
    damage: "Damage",
    sales: "Sales",
    customers: "Customers",
    reports: "Target & Report",
    marketing: "Marketing",
    employees: "Employees",
};

/**
 * A permission written the way the owner will read it in a 403.
 *
 * "Ask the owner to enable: page:sales.ledger" is a stack trace pointed at a
 * colleague. "Ask the owner to enable: Sales - Sales Ledger" is something they
 * can act on, and matches the box and tick they will be looking for.
 */
export const permissionLabel = (name: string): string => {
    if (!name.startsWith("page:") && !name.startsWith("act:")) return name;
    const group = GROUP_TITLES[groupOf(name)] ?? groupOf(name);
    if (name.startsWith("act:")) return `${group} - delete`;
    const leaf = name.slice(name.lastIndexOf(".") + 1);
    return `${group} - ${leaf.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
};

/** Every one of these, spelled for a human, deduped. Used by requirePermission. */
export const describePermissions = (names: readonly string[]): string =>
    [...new Set(names.map(permissionLabel))].join(" or ");

/** Whether a group's delete tick exists at all. */
export const deletePermissionFor = (group: string): string | undefined => DELETE_BY_GROUP.get(group);
