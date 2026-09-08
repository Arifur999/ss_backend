import "dotenv/config";
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/app/lib/prisma.js";
import { reconcileLoanProfitMirror } from "../src/app/module/loan/profitMirror.helpers.js";
import { needsExpenseCategory } from "../src/app/shared/loanProfitMirror.js";

// ---------------------------------------------------------------------------
// Put the loan profit already on the books into the profit-and-loss.
//
// From the loan_profit_mirror migration onward, every profit row writes a twin:
// profit paid becomes an expense, profit received becomes an other-income, so
// the P&L finally sees the cost of borrowing and the income from lending. Rows
// entered BEFORE that have no twin, so history still reads as though interest
// were free.
//
// This walks those rows and writes the missing twins by calling the same
// reconcile the app itself calls - so a backfilled row is identical to one the
// form would produce, and there is no second implementation of the rules to
// keep in step.
//
// Profit PAID needs a category and the old rows do not have one, so they are
// filed under a per-owner "Loan Profit Paid" category, created once. The owner
// can re-file individual rows afterwards from Loan Transactions. Profit
// RECEIVED needs nothing invented: Other Income has no categories and the
// lender's name is its whole classification.
//
// SAY THIS OUT LOUD BEFORE RUNNING IT: this moves the reported profit of every
// past month that contains a profit row, by the interest in it. That is the
// point - but run it on a day when nobody is quoting last month's figure.
//
// Dry run by default. Nothing is written without --apply:
//   npx tsx scripts/backfillLoanProfitMirror.ts            # list only
//   npx tsx scripts/backfillLoanProfitMirror.ts --apply    # write
//
// Safe to run more than once: the where clause below only picks up profit rows
// that have no twin yet.
// ---------------------------------------------------------------------------

const FALLBACK_CATEGORY = "Loan Profit Paid";

const apply = process.argv.includes("--apply");

/** One shared category per workspace, created on first use. */
const ensureFallbackCategory = async (tx: Prisma.TransactionClient, ownerId: string) => {
    const existing = await tx.expenseCategory.findFirst({
        where: { owner_id: ownerId, name: FALLBACK_CATEGORY },
        select: { id: true, name: true },
    });

    if (existing) return existing;

    return tx.expenseCategory.create({
        data: { owner_id: ownerId, name: FALLBACK_CATEGORY },
        select: { id: true, name: true },
    });
};

async function main() {
    const rows = await prisma.loan.findMany({
        where: {
            payment_category: "profit",
            deleted_at: null,
            expense_id: null,
            other_income_id: null,
        },
        orderBy: [{ date: "asc" }, { created_at: "asc" }],
    });

    if (rows.length === 0) {
        console.log("Every profit row already has its twin - nothing to backfill.");
        return;
    }

    console.log(`Found ${rows.length} profit row(s) with nothing in the P&L behind them:\n`);
    let paidTotal = 0;
    let receivedTotal = 0;

    for (const row of rows) {
        const paid = Number(row.payment_amount);
        const received = Number(row.received_amount);
        paidTotal += paid;
        receivedTotal += received;
        const side = paid > 0 ? `paid ${paid}` : `received ${received}`;
        const filed = row.expense_category_name || (paid > 0 ? `-> ${FALLBACK_CATEGORY}` : "-> Other Income");
        console.log(`  ${row.date.toISOString().slice(0, 10)}  ${row.lender_name.padEnd(24)} ${side.padEnd(18)} ${filed}`);
    }

    console.log(`\nTotals: ${paidTotal} would become expenses, ${receivedTotal} would become other income.`);

    if (!apply) {
        console.log("\nDry run - nothing written. Re-run with --apply to write the twins.");
        return;
    }

    let written = 0;
    for (const row of rows) {
        await prisma.$transaction(async (tx) => {
            let loan = row;

            // A profit payment cannot be filed without a category, and these
            // rows predate the picker. Give them the shared fallback rather
            // than leaving the money out of every category breakdown.
            if (needsExpenseCategory(row) && !row.expense_category_id) {
                const category = await ensureFallbackCategory(tx, row.owner_id);
                loan = await tx.loan.update({
                    where: { id: row.id },
                    data: { expense_category_id: category.id, expense_category_name: category.name },
                });
            }

            await reconcileLoanProfitMirror(tx, loan, {
                ownerId: row.owner_id,
                userId: row.created_by || row.owner_id,
                // The reconcile reads only ownerId and userId; the rest of
                // IRequestUser is here to satisfy the type, not to be used.
                role: "owner",
                email: "",
                name: "backfill script",
                permissions: [],
            });
        });
        written += 1;
    }

    console.log(`\nWrote ${written} twin(s). The profit-and-loss now sees every loan profit on the books.`);
}

main()
    .catch((error) => {
        console.error("Backfill failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
