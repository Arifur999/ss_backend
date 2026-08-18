/**
 * What a team member is allowed to do, beyond what their role already allows.
 *
 * Two layers, and the order matters:
 *
 *   1. Role  (checkAuth)         - the outer gate. An owner-only route is
 *                                  owner-only no matter what is ticked here.
 *   2. Permission (this file)    - narrows WITHIN a role. This is the layer that
 *                                  did not exist: the Settings screen offered
 *                                  sixty checkboxes, `save()` never sent them,
 *                                  and no column stored them - so a Manager
 *                                  whose "Delete Sale" box was cleared could
 *                                  still delete sales.
 *
 * The role gate was already doing the heavy lifting, which is why the damage was
 * narrower than it looked: sales_staff could never delete a sale, customer,
 * product, supplier, purchase or expense - every one of those routes is
 * owner/manager only. What could not be expressed was "this Manager, but not
 * deletions".
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

/** Every permission that maps to a feature this app actually has. */
export const PERMISSIONS = [
    // Purchase / supplier
    "View Purchase",
    "Add Purchase",
    "Edit Purchase",
    "Delete Purchase",
    "Receive Stock",

    // Sales
    "View Sales",
    "New Sale",
    "Edit Sale",
    "Delete Sale",
    "Discount",

    // Due management
    "View Due",
    "Add Due",
    "Edit Due",
    "Delete Due",

    // Expenses
    "View Expense",
    "Add Expense",
    "Edit Expense",
    "Delete Expense",

    // Contacts
    "View Customer",
    "Add Customer",
    "Edit Customer",
    "Delete Customer",
    "View Supplier",
    "Add Supplier",
    "Edit Supplier",
    "Delete Supplier",
    "View Employee",
    "Add Employee",
    "Edit Employee",
    "Delete Employee",

    // Inventory
    "Product List",
    "Add Product",
    "Edit Product",
    "Delete Product",
    "Stock Update",
    "Stock History",

    // Money
    "View Balance",
    "Account Transfer",
    "View Shareholders",
    "Profit Withdrawal",
    "View Loans",
    "Manage Loans",

    // Reports & system
    "View Reports",
    "Business Settings",
    "User Management",
    "Marketing SMS",
    "Recycle Bin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

/**
 * Keep only the names this build knows about.
 *
 * A permission removed in a later version stays in old rows; silently dropping
 * it on read is better than failing the save, and better than storing a name
 * nothing will ever check.
 */
export const sanitizePermissions = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value): value is string => typeof value === "string" && PERMISSION_SET.has(value)))];
};
