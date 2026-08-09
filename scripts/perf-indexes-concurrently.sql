-- Run this on the LIVE database BEFORE deploying the matching migration.
--
-- CREATE INDEX CONCURRENTLY builds the index while reads and writes keep
-- working, so there is no downtime. It cannot run inside a transaction, which
-- is why it lives here rather than in prisma/migrations - Prisma wraps each
-- migration in one. The migration repeats the same indexes with plain
-- CREATE INDEX IF NOT EXISTS, so once this has run it is a no-op there.
--
-- How to run it, from the folder holding docker-compose.yml on the VPS:
--
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--     < scripts/perf-indexes-concurrently.sql
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'ANALYZE;'
--
-- If one fails part-way it leaves an INVALID index behind; drop it and retry:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--   DROP INDEX CONCURRENTLY <name>;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "sales_owner_id_date_idx"              ON "sales" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "purchases_owner_id_date_idx"          ON "purchases" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_owner_id_date_idx"           ON "expenses" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "other_incomes_owner_id_date_idx"      ON "other_incomes" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "investments_owner_id_date_idx"        ON "investments" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "profit_withdrawals_owner_id_date_idx" ON "profit_withdrawals" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "loans_owner_id_date_idx"              ON "loans" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "account_transfers_owner_id_date_idx"  ON "account_transfers" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sale_payments_owner_id_date_idx"      ON "sale_payments" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_payments_owner_id_date_idx"  ON "customer_payments" ("owner_id", "date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "supplier_payments_owner_id_date_idx"  ON "supplier_payments" ("owner_id", "date" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "inventory_history_owner_id_created_at_idx" ON "inventory_history" ("owner_id", "created_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "sale_items_product_id_idx"              ON "sale_items" ("product_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "purchase_items_product_id_idx"          ON "purchase_items" ("product_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "purchase_receives_purchase_item_id_idx" ON "purchase_receives" ("purchase_item_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sale_deliveries_sale_item_id_idx"       ON "sale_deliveries" ("sale_item_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sale_item_cost_layers_sale_id_idx"      ON "sale_item_cost_layers" ("sale_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_payments_sale_id_idx"          ON "customer_payments" ("sale_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "products_supplier_id_idx"               ON "products" ("supplier_id");
