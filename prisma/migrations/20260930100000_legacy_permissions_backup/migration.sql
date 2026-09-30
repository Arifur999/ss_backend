-- Somewhere to put a user's old permission ticks before they are rewritten.
--
-- The Permissions screen is moving from an action-shaped vocabulary
-- ("View Sales", "Delete Purchase") to a menu-shaped one ("page:sales.ledger",
-- "act:purchase.delete"), so every array already stored has to be translated by
-- scripts/migratePermissions.ts.
--
-- That translation is the one step in the whole change that cannot be undone by
-- re-running something: sanitizePermissions() drops any name this build does not
-- recognise, so the moment the new list ships, an untranslated row reads as an
-- EMPTY array - and an empty array means "everything the role allows". A
-- restricted user would be silently widened to their full role with no error and
-- no log anywhere.
--
-- So the script copies the old array here first and rolling back becomes one
-- UPDATE. Additive and defaulted, so no existing row changes meaning and no
-- deploy ordering matters. Drop the column two releases after the migration is
-- confirmed in production.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legacy_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
