-- Monthly plan price: 599 Tk.
--
-- The column defaulted to 600 and the live settings row was seeded before that,
-- so the plan cards and the checkout amount were showing the old figure. The
-- owner set the price at 599, so this overwrites the stored value rather than
-- only filling a blank one - unlike support_number, there is no "unset" price
-- to distinguish from a deliberate one, and 599 is the decision.
--
-- Yearly is untouched: it is a discounted figure the super admin manages from
-- Settings and was not part of this change.
ALTER TABLE "platform_settings" ALTER COLUMN "monthly_price" SET DEFAULT 599;

UPDATE "platform_settings" SET "monthly_price" = 599;
