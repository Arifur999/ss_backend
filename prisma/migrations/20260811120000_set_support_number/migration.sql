-- The support hotline shown on the payment screens.
--
-- The column defaulted to an empty string, and the settings row predates it, so
-- the number was blank in production and the "Need help?" line never rendered.
-- Sets the default for any future row and fills the existing one - but only
-- when it is still empty, so a number the super admin has since typed in
-- Settings is never overwritten.
ALTER TABLE "platform_settings" ALTER COLUMN "support_number" SET DEFAULT '01719731884';

UPDATE "platform_settings"
SET "support_number" = '01719731884'
WHERE "support_number" IS NULL OR btrim("support_number") = '';
