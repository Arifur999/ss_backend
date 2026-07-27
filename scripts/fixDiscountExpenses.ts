import "dotenv/config";
import { prisma } from "../src/app/lib/prisma.js";

// ---------------------------------------------------------------------------
// One-time cleanup for the discount-reduces-balance bug.
//
// "Customer Due Discount" waivers used to be recorded as an expense against a
// CASH/BANK account, which wrongly reduced that account's balance on the
// Balance Dashboard. Going forward these are recorded with no account (see
// CustomerDueReceived.tsx). This script fixes the rows already in the DB:
// it detaches every auto-generated discount expense from its account
// (account_id -> null, account_name -> ""), so the balance is restored while
// the expense still counts toward total expenses / net profit.
//
// Safe to run more than once (idempotent - already-null rows are skipped by
// the where filter). Run against production with:
//   railway run npx tsx scripts/fixDiscountExpenses.ts
// ---------------------------------------------------------------------------

const DISCOUNT_NOTE_PREFIX = "Automatically generated from Customer Due Discount";

async function main() {
    const candidates = await prisma.expense.findMany({
        where: {
            notes: { startsWith: DISCOUNT_NOTE_PREFIX },
            account_id: { not: null },
        },
        select: { id: true, amount: true, account_name: true, notes: true },
    });

    if (candidates.length === 0) {
        console.log("No discount expenses need fixing - balance is already correct.");
        return;
    }

    console.log(`Found ${candidates.length} discount expense(s) still attached to an account:`);
    for (const row of candidates) {
        console.log(`  - ${row.amount} (was on "${row.account_name}") | ${row.notes}`);
    }

    const result = await prisma.expense.updateMany({
        where: {
            notes: { startsWith: DISCOUNT_NOTE_PREFIX },
            account_id: { not: null },
        },
        data: { account_id: null, account_name: "" },
    });

    console.log(`\nDetached ${result.count} discount expense(s) from their account. Balance is now corrected.`);
}

main()
    .catch((error) => {
        console.error("Cleanup failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
