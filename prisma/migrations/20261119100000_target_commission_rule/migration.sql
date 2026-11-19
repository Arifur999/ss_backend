-- What a supplier pays when a purchase target is met.
--
-- The targets table has only ever held the goal. The commission the supplier
-- agreed to pay for reaching it lived nowhere, so the app could show how much
-- had been bought but never what meeting the target was worth - and when the
-- commission arrived it had to be typed in from memory.
--
-- A percent rule is per cent OF THE TARGET, not of what was actually bought.
-- That is deliberate: a commission computed off the running total would move
-- every time another bill was entered and could not be promised in advance, so
-- "buy 40,000 more to earn 12,000" would be unsayable.
--
-- Additive and defaulted to `none`, so every existing target keeps meaning
-- exactly what it meant: a goal with nothing attached to it.

DO $$ BEGIN
    CREATE TYPE "CommissionRule" AS ENUM ('none', 'percent', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "purchase_targets"
    ADD COLUMN IF NOT EXISTS "commission_rule" "CommissionRule" NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS "commission_value" DECIMAL(15, 2) NOT NULL DEFAULT 0;
