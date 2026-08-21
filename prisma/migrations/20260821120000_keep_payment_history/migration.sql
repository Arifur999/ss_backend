-- Keep the money history when a customer is deleted.
--
-- Both payment tables cascaded with their owner, so removing a customer took
-- their whole payment history with them. Someone who had paid Tk 50,000 over
-- two years was erased from the platform's lifetime revenue, the monthly chart
-- and every total built on them - silently, with nothing left to say the money
-- had ever arrived. A business's own books should not be a child record of the
-- customer who paid into them.
--
-- owner_id becomes nullable and the foreign key becomes ON DELETE SET NULL: the
-- payment survives, orphaned but intact, and every figure derived from it holds.
-- Rows that still have an owner are unaffected, so nothing about an existing
-- customer changes.
--
-- What stays on CASCADE, deliberately: sms_wallets, sms_messages,
-- marketing_contacts and the workspace tables. A credit balance or a sent
-- message with nobody to own it is not a record of anything - only the money
-- that came in is worth keeping after the customer goes.

ALTER TABLE "subscription_payments" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "subscription_payments" DROP CONSTRAINT "subscription_payments_owner_id_fkey";
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sms_purchases" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "sms_purchases" DROP CONSTRAINT "sms_purchases_owner_id_fkey";
ALTER TABLE "sms_purchases" ADD CONSTRAINT "sms_purchases_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
