import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { roundTaka } from "../../shared/money.js";

// ---------------------------------------------------------------------------
// What was done on a given day.
//
// Read out of the real tables rather than a log somebody has to remember to
// write to: an entry that exists is a thing that happened, and a log that has
// to be maintained alongside every module is a log that drifts the first time
// one of them is edited.
//
// Filtered on created_at, not on the business `date`, because the question is
// "what did we DO today". Entering an invoice this morning for goods sold last
// week is work done today, and dating the feed by the invoice would hide it.
// The two can therefore disagree with a day's ledger totals, which is correct -
// this is a record of actions, not a day book.
//
// The window is a UTC day, built the way dateRangeWhere builds every other date
// filter in this app (shared/listQuery.ts). Being consistent matters more than
// being clever here: a window offset for Dhaka would put this feed and the
// ledgers on different days for the same date.
// ---------------------------------------------------------------------------

export type ActivityDirection = "in" | "out" | "none";

export type ActivityEvent = {
    at: Date;
    kind: string;
    title: string;
    subtitle: string;
    amount: number;
    direction: ActivityDirection;
};

const dayWindow = (day: string) => ({
    gte: new Date(`${day}T00:00:00.000Z`),
    lte: new Date(`${day}T23:59:59.999Z`),
});

const num = (value: unknown) => roundTaka(value);

const getDayActivity = async (day: string, user: IRequestUser) => {
    const created_at = dayWindow(day);
    const where = { owner_id: user.ownerId, created_at };

    const [sales, purchases, receives, expenses, customerPayments, supplierPayments, loans, otherIncome] =
        await Promise.all([
            prisma.sale.findMany({
                where: { ...where, deleted_at: null, status: "completed" },
                select: { created_at: true, invoice_no: true, customer_name: true, net_amount: true, paid_amount: true },
            }),
            prisma.purchase.findMany({
                where: { ...where, deleted_at: null },
                select: { created_at: true, si_no: true, supplier_name: true, net_amount: true },
            }),
            prisma.purchaseReceive.findMany({
                where,
                select: {
                    created_at: true, received_qty: true, receiver_name: true,
                    purchase_item: { select: { product_name: true } },
                },
            }),
            prisma.expense.findMany({
                where,
                select: { created_at: true, category_name: true, notes: true, amount: true },
            }),
            prisma.customerPayment.findMany({
                where,
                select: { created_at: true, customer_name: true, account_name: true, amount: true },
            }),
            prisma.supplierPayment.findMany({
                where,
                select: { created_at: true, supplier_name: true, account_name: true, amount: true },
            }),
            prisma.loan.findMany({
                where,
                select: {
                    created_at: true, lender_name: true, transaction_type: true,
                    received_amount: true, payment_amount: true,
                },
            }),
            prisma.otherIncome.findMany({
                where,
                select: { created_at: true, source_name: true, supplier_name: true, amount: true },
            }),
        ]);

    const events: ActivityEvent[] = [
        ...sales.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Sale",
            title: row.customer_name || "Walk-in customer",
            subtitle: row.invoice_no,
            amount: num(row.net_amount),
            direction: "in",
        })),
        ...purchases.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Purchase order",
            title: row.supplier_name || "-",
            subtitle: row.si_no,
            amount: num(row.net_amount),
            direction: "out",
        })),
        ...receives.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Stock received",
            title: row.purchase_item?.product_name || "-",
            // Quantity, not money: nothing is paid by receiving goods, and
            // putting a taka figure here would double-count the purchase.
            subtitle: `${row.received_qty} pcs${row.receiver_name ? ` - ${row.receiver_name}` : ""}`,
            amount: 0,
            direction: "none",
        })),
        ...expenses.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Expense",
            title: row.category_name || "-",
            subtitle: row.notes || "",
            amount: num(row.amount),
            direction: "out",
        })),
        ...customerPayments.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Due collected",
            title: row.customer_name || "-",
            subtitle: row.account_name || "",
            amount: num(row.amount),
            direction: "in",
        })),
        ...supplierPayments.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Supplier paid",
            title: row.supplier_name || "-",
            subtitle: row.account_name || "",
            amount: num(row.amount),
            direction: "out",
        })),
        ...loans.map((row): ActivityEvent => {
            const received = num(row.received_amount);
            const paid = num(row.payment_amount);
            const isReceive = row.transaction_type === "receive" || received > paid;
            return {
                at: row.created_at,
                kind: isReceive ? "Loan received" : "Loan repaid",
                title: row.lender_name || "-",
                subtitle: "",
                amount: isReceive ? received : paid,
                direction: isReceive ? "in" : "out",
            };
        }),
        ...otherIncome.map((row): ActivityEvent => ({
            at: row.created_at,
            kind: "Other income",
            title: row.source_name || row.supplier_name || "-",
            subtitle: "",
            amount: num(row.amount),
            direction: "in",
        })),
    ];

    // Oldest first: a day reads forwards.
    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    const totals = events.reduce(
        (sum, event) => ({
            in: sum.in + (event.direction === "in" ? event.amount : 0),
            out: sum.out + (event.direction === "out" ? event.amount : 0),
        }),
        { in: 0, out: 0 }
    );

    return { date: day, count: events.length, totals, events };
};

export const ActivityService = { getDayActivity };
