-- What a team member may do WITHIN their role.
--
-- Additive and defaulted, so every existing user gets an empty array and the
-- middleware reads that as "everything the role allows". Nobody is signed out,
-- nobody loses access, and an older container still serving during the rollover
-- simply ignores a column it does not know about.
--
-- Restrictions only begin to apply to a user once somebody has actually ticked
-- boxes for them in Settings.

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
