-- Set the live plan prices requested by the owner:
-- Monthly 599, Yearly 5750 (shown 20% off the 7188 original).
UPDATE "platform_settings"
SET "monthly_price" = 599,
    "yearly_price" = 5750,
    "yearly_original_price" = 7188;
