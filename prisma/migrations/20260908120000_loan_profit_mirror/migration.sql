-- Put loan profit where the profit-and-loss can see it.
--
-- A profit row already moves cash: Balance.tsx folds received_amount and
-- payment_amount into every account, so paying a lender Tk 5,000 of interest
-- takes Tk 5,000 out of the drawer today. What it does NOT do is show up as a
-- cost. The owner pays interest all year and the P&L reads as though the money
-- were free, and the profit earned on money lent out is invisible the same
-- way: Loan Management knew about it and nothing else did.
--
-- So a profit row now writes a twin - profit paid becomes an expense, profit
-- received becomes an other-income. These four columns are what tie the two
-- together, and what let the twin be rebuilt from the loan row alone.
--
-- The twin carries NO account_id. That is the whole safety argument: sumBy() in
-- Balance.tsx matches on account_id, so a row with none touches no balance,
-- while every P&L reader sums with no account filter at all and therefore sees
-- it. Give the twin an account and the Balance Dashboard is wrong by the amount
-- of every interest payment ever made.
--
-- Purely additive and nullable/defaulted, so every existing row is unchanged
-- and no figure on any screen moves. An older container still serving through
-- the rollover simply never selects these columns. Deliberately no backfill of
-- the profit rows already on the books - that moves the reported profit of
-- every past month, so it is a decision the owner makes on a chosen day, with
-- scripts/backfillLoanProfitMirror.ts.

ALTER TABLE "loans"
    ADD COLUMN IF NOT EXISTS "expense_category_id"   TEXT,
    ADD COLUMN IF NOT EXISTS "expense_category_name" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "expense_id"            TEXT,
    ADD COLUMN IF NOT EXISTS "other_income_id"       TEXT;

-- The category the owner picked, kept ON THE LOAN rather than only on the
-- expense. This is what makes a loan row self-sufficient: deleting one hard-
-- deletes it into a snapshot and takes its expense with it, so a restore has to
-- be able to REBUILD that expense from the loan and nothing else.
--
-- SET NULL, exactly like salary_transactions.category_id, and for the same
-- reason: the denormalised name beside it keeps the row readable after the
-- category is gone. RESTRICT would let a loan - a permanent record of money
-- that moved - hold a setup row hostage forever.
ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_expense_category_id_fkey";
ALTER TABLE "loans" ADD CONSTRAINT "loans_expense_category_id_fkey"
    FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL on both twins, mirroring salary_transactions.expense_id. The link
-- going stale is survivable - the loan still holds every fact needed to write a
-- fresh twin. RESTRICT here would mean deleting the twin from the Expenses page
-- is refused by Postgres with an error nobody can act on; the service refuses it
-- with a sentence instead.
ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_expense_id_fkey";
ALTER TABLE "loans" ADD CONSTRAINT "loans_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expenses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_other_income_id_fkey";
ALTER TABLE "loans" ADD CONSTRAINT "loans_other_income_id_fkey"
    FOREIGN KEY ("other_income_id") REFERENCES "other_incomes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Three lookups that would otherwise scan the whole loan ledger:
--   "is this expense owned by a loan?" - the guard on every expense edit and
--   delete, and the filter on every activity feed
--   the same for other income
--   "does this category still have loan rows?" - the category delete guard
CREATE INDEX IF NOT EXISTS "loans_expense_id_idx" ON "loans"("expense_id");
CREATE INDEX IF NOT EXISTS "loans_other_income_id_idx" ON "loans"("other_income_id");
CREATE INDEX IF NOT EXISTS "loans_expense_category_id_idx" ON "loans"("expense_category_id");
