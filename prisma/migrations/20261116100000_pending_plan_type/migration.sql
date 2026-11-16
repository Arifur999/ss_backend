-- Somewhere to keep "which plan is this owner buying" that is not the column
-- saying which plan they have.
--
-- Clicking Monthly opens a bKash checkout. Nothing is charged, no payment row
-- exists, and the super admin has approved nothing - but choosePlan wrote
-- plan_type, plan and an expiry date at that moment anyway. Two things broke:
--
--   1. The Current Plan page reads plan_type and expiry_date, so it announced
--      a plan nobody had paid for, dated a month out.
--   2. The free-trial check read plan_type and could not tell "chose this"
--      from "owns this", so looking at the monthly price burned a trial that
--      had never been used.
--
-- A paid selection now writes only this column, and the approval - which reads
-- the payment row, not the subscription - writes the real plan and dates.
--
-- Nullable with no default: null means "not in the middle of buying anything",
-- which is true of every existing row.

ALTER TABLE "owner_subscriptions" ADD COLUMN IF NOT EXISTS "pending_plan_type" "PlanType";
