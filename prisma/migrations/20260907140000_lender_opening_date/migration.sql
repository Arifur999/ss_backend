-- The day an account's opening balance is as of.
--
-- A passbook prints a date on its first line, and the account form now asks
-- for one. Nullable rather than defaulted to today: every existing account
-- predates the field, and stamping them all with the day of the deploy would
-- assert something untrue about when their balance was struck.
--
-- Purely additive. Nothing reads it to compute a balance - the opening figure
-- still comes before every transaction, which is what "opening" means.

ALTER TABLE "loan_lenders"
    ADD COLUMN IF NOT EXISTS "opening_date" DATE;
