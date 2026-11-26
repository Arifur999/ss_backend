-- The terms of a loan, which the database had nowhere to put.
--
-- Loan Management showed running balances - dena and pawna - and could not
-- answer the questions the pages are actually opened with: how much of the
-- loan is left, how much principal has been repaid, and what is due this
-- month. None of that is derivable from a balance; it needs the original
-- amount, the instalment, and which way the money went.
--
-- Backfilled from what each account already holds:
--   direction   the sign of the opening balance - negative means the shop
--               owes, which is a loan taken. Zero means taken, because an
--               account opened at zero is nearly always money about to be
--               borrowed, and the owner can change it in one click.
--   loan_amount the opening balance, unsigned. That is exactly what the form
--               asks for on a loan that started before this software did:
--               "the amount still left today".
--   loan_date   the opening date, where one was recorded.
--
-- Rate and instalment cannot be guessed from anything stored, so they start
-- at zero and the dashboard simply says nothing is due until they are filled
-- in.

ALTER TABLE "loan_lenders"
    ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'taken',
    ADD COLUMN "loan_date" DATE,
    ADD COLUMN "loan_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN "interest_rate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    ADD COLUMN "monthly_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

UPDATE "loan_lenders"
SET
    direction = CASE WHEN opening_balance > 0 THEN 'given' ELSE 'taken' END,
    loan_amount = ABS(opening_balance),
    loan_date = opening_date;
