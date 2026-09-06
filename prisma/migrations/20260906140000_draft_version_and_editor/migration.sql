-- Two columns the drafts table should have had from the start. A separate
-- migration because the first one has already been applied, and editing an
-- applied migration fails `prisma migrate deploy` on a checksum mismatch.
--
-- payload_version: `data` is the page's form state stored verbatim, which is
-- what makes a half-finished order storable at all - but it also means a
-- renamed field turns an old draft into one that hydrates half-correctly and
-- publishes something subtly wrong. Stamping the shape lets the page refuse a
-- draft it no longer understands instead of guessing at it.
--
-- updated_by: drafts are workspace-wide by design, so two people can touch one.
-- "Who had this last" is the first question asked when a draft looks wrong, and
-- created_by cannot answer it.

ALTER TABLE "drafts"
    ADD COLUMN IF NOT EXISTS "payload_version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "updated_by" TEXT;
