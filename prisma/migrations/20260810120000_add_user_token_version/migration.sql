-- Lets a password change end every session that user already had.
--
-- Every existing row gets 0, and checkAuth reads a missing version claim as 0
-- too, so tokens handed out before this column existed still match and nobody
-- is signed out by the deploy. The number only moves when a password changes.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
