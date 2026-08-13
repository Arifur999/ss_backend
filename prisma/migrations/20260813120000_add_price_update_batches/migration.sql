-- History for the bulk price update: one row per run, not per product.
--
-- Purely additive - a new table nothing else references, so an older container
-- still running during the rollover is unaffected by it existing.
CREATE TABLE IF NOT EXISTS "price_update_batches" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL DEFAULT '',
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "unchanged_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_update_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "price_update_batches_owner_id_created_at_idx"
    ON "price_update_batches"("owner_id", "created_at");
