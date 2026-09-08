-- Let a profit RECEIPT say where the income came from.
--
-- Profit received writes an other-income row, and that row's whole
-- classification is its source name - Other Income has no categories, unlike
-- the expense side. Until now the source was always the lender's name, taken
-- straight off the loan. That is a fine default and a poor label: six months
-- later a row reading "Jowel Bhai" says who paid but not what for, and the
-- owner reconciling a report has to open Loan Management to find out.
--
-- So the source becomes something the owner writes when entering the
-- transaction - "Loan Interest", "Rent from Jowel Bhai", whatever will still
-- make sense later - and it is kept ON THE LOAN, beside expense_category_name,
-- for the same reason that one is: deleting a loan takes its other-income with
-- it, and restoring has to rebuild that row from the loan alone.
--
-- Empty means "use the lender's name", so every row already on the books keeps
-- behaving exactly as it does today. Purely additive with a default: no figure
-- anywhere changes, and an older container still serving through the rollover
-- simply never selects the column.

ALTER TABLE "loans"
    ADD COLUMN IF NOT EXISTS "income_source_name" TEXT NOT NULL DEFAULT '';
