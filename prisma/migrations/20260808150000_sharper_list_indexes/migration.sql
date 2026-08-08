-- Partial indexes matching the list queries exactly.
--
-- The earlier composite on (owner_id, deleted_at, created_at) was not being
-- chosen: the planner used the plain owner_id index and then sorted the
-- owner's whole catalogue with a top-N heapsort. At 3,000 rows that costs
-- about 3ms and does not matter; at 30,000 it is the difference between a
-- list that opens instantly and one that does not.
--
-- Putting `deleted_at IS NULL` in the index predicate rather than a column
-- makes the index cover exactly the rows every list asks for, so the planner
-- can walk it in order and stop after forty - no sort at all.

CREATE INDEX IF NOT EXISTS "products_live_created_idx"
    ON "products" ("owner_id", "created_at" DESC)
    WHERE "deleted_at" IS NULL;

-- Product List and Inventory both order by code when searching.
CREATE INDEX IF NOT EXISTS "products_live_code_idx"
    ON "products" ("owner_id", "product_code")
    WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "customers_live_created_idx"
    ON "customers" ("owner_id", "created_at" DESC)
    WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "sales_live_date_idx"
    ON "sales" ("owner_id", "date" DESC, "created_at" DESC)
    WHERE "deleted_at" IS NULL;

-- Keep the planner's row estimates sharp for the trigram indexes; without
-- current statistics it falls back to a filter even when the index would win.
ANALYZE "products";
ANALYZE "customers";
ANALYZE "sales";
