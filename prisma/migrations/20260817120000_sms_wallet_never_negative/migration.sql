-- An SMS wallet can never hold fewer than zero credits.
--
-- The service now reserves credits with a conditional UPDATE before it calls the
-- paid gateway, so it cannot oversell on its own. This is the database saying so
-- too: any future code path that decrements without checking fails loudly here
-- instead of quietly handing the platform someone else's MRAM bill.
--
-- Two things make this safe to apply to a live database:
--
-- 1. Any wallet already negative is lifted to 0 first, or ADD CONSTRAINT would
--    refuse. That is a correction in the owner's favour and there should be no
--    such rows, but the audit found the old code could produce them.
-- 2. Wrapped in a DO block that skips if the constraint is already there, so
--    re-running the migration is harmless.

UPDATE "sms_wallets" SET "balance" = 0 WHERE "balance" < 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sms_wallets_balance_non_negative'
    ) THEN
        ALTER TABLE "sms_wallets"
            ADD CONSTRAINT "sms_wallets_balance_non_negative" CHECK ("balance" >= 0);
    END IF;
END $$;
