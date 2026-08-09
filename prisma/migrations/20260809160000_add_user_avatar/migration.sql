-- A profile photo for a user. Purely additive: existing rows get the empty
-- string, which the UI reads as "no photo, show initials instead", so nothing
-- has to be backfilled and no existing behaviour changes.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT NOT NULL DEFAULT '';
