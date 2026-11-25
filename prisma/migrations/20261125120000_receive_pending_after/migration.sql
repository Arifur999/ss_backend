-- What was still owed on the line after this delivery, frozen at the moment
-- it was signed for.
--
-- A receive memo is a document two parties sign. Recomputing "after receive"
-- when the memo is reprinted would show today's balance instead of the one on
-- the paper, because the line's received_qty moves on with every further
-- delivery.
--
-- Nullable: every receive recorded before today simply does not have it, and
-- the memo sheet leaves the column blank rather than inventing a number.

ALTER TABLE "purchase_receives" ADD COLUMN "pending_after" INTEGER;
