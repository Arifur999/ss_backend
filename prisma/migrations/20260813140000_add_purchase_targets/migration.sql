-- Buying targets per supplier over a range of months.
--
-- Additive: a new table with one foreign key out to suppliers and nothing
-- pointing back at it, so an older container still serving during the
-- rollover is unaffected by it existing.
CREATE TABLE IF NOT EXISTS "purchase_targets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "start_month" INTEGER NOT NULL,
    "end_year" INTEGER NOT NULL,
    "end_month" INTEGER NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_targets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "purchase_targets_owner_id_start_year_start_month_idx"
    ON "purchase_targets"("owner_id", "start_year", "start_month");

DO $$
BEGIN
    ALTER TABLE "purchase_targets"
        ADD CONSTRAINT "purchase_targets_supplier_id_fkey"
        FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
