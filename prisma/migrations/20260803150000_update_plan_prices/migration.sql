-- Monthly goes up by 100 (599 -> 699). Yearly follows the same rule it always
-- had: struck-through price = monthly x 12 (8388), charged price = 20% off that
-- (6710, rounded).
UPDATE "platform_settings"
SET "monthly_price" = 699,
    "yearly_original_price" = 8388,
    "yearly_price" = 6710;
