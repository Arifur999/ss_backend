-- Tell principal apart from profit on a loan transaction.
--
-- Until now a loan row carried one amount and no idea what it was, so a
-- lender's outstanding debt and the interest earned on it were the same
-- number. Worse, the browser's balance maths added interest with the same sign
-- as a repayment, so Tk 5,000 of interest on a Tk 100,000 loan read as
-- Tk 95,000 owed.
--
-- The money stays where it is. A profit payment is still cash leaving the
-- drawer, and the Balance Dashboard folds received_amount and payment_amount
-- into every account - so moving profit into a column of its own would take
-- that cash off the books. This column says what the movement WAS; the
-- principal calculation is what learns to skip it.
--
-- Purely additive with a default, so every existing row is principal and no
-- balance anywhere changes. An older container still serving through the
-- rollover simply never selects the column.

ALTER TABLE "loans"
    ADD COLUMN IF NOT EXISTS "payment_category" TEXT NOT NULL DEFAULT 'principal';

-- Rows carrying interest can only have come from the Supabase original: this
-- app has hardcoded interest_amount to 0 on every save it has ever made. Where
-- one exists, that money was profit, and it belongs in the column the cash
-- balance actually reads - otherwise it has been invisible to the account all
-- along and would stay invisible.
--
-- Guarded so re-running changes nothing: a row already marked profit is left
-- alone rather than having its amount added a second time.
UPDATE "loans"
   SET "payment_category" = 'profit',
       "received_amount" = CASE WHEN "transaction_type" = 'receive'
                                THEN "interest_amount" ELSE "received_amount" END,
       "payment_amount"  = CASE WHEN "transaction_type" = 'payment'
                                THEN "interest_amount" ELSE "payment_amount" END
 WHERE "interest_amount" > 0
   AND "payment_category" = 'principal';

-- Every statement reads "this lender's rows, oldest first".
CREATE INDEX IF NOT EXISTS "loans_owner_id_lender_id_date_idx"
    ON "loans"("owner_id", "lender_id", "date");
