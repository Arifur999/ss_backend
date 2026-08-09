-- Performance indexes.
--
-- Two things every list query does that nothing indexed before:
--   1. "this owner, newest first" - owner_id and date were separate indexes,
--      so Postgres read all of the owner's rows and then sorted them.
--   2. joins/FK checks on product_id, purchase_item_id, sale_item_id, sale_id
--      and supplier_id - unindexed, so every product delete, cost backfill and
--      stock aggregate did a sequential scan.
--
-- On the live database these were already created with CREATE INDEX
-- CONCURRENTLY (see scripts/perf-indexes-concurrently.sql), which does not
-- lock the table but cannot run inside a transaction - and Prisma wraps every
-- migration in one. IF NOT EXISTS therefore makes this a no-op there, while
-- still building the indexes on a fresh database.

-- Ledgers: (owner_id, date DESC)
CREATE INDEX IF NOT EXISTS "sales_owner_id_date_idx"              ON "sales" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "purchases_owner_id_date_idx"          ON "purchases" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "expenses_owner_id_date_idx"           ON "expenses" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "other_incomes_owner_id_date_idx"      ON "other_incomes" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "investments_owner_id_date_idx"        ON "investments" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "profit_withdrawals_owner_id_date_idx" ON "profit_withdrawals" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "loans_owner_id_date_idx"              ON "loans" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "account_transfers_owner_id_date_idx"  ON "account_transfers" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "sale_payments_owner_id_date_idx"      ON "sale_payments" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "customer_payments_owner_id_date_idx"  ON "customer_payments" ("owner_id", "date" DESC);
CREATE INDEX IF NOT EXISTS "supplier_payments_owner_id_date_idx"  ON "supplier_payments" ("owner_id", "date" DESC);

-- Inventory history is a top-N by created_at for one owner.
CREATE INDEX IF NOT EXISTS "inventory_history_owner_id_created_at_idx" ON "inventory_history" ("owner_id", "created_at" DESC);

-- Foreign keys used by joins, cascades and bulk updates.
CREATE INDEX IF NOT EXISTS "sale_items_product_id_idx"                ON "sale_items" ("product_id");
CREATE INDEX IF NOT EXISTS "purchase_items_product_id_idx"            ON "purchase_items" ("product_id");
CREATE INDEX IF NOT EXISTS "purchase_receives_purchase_item_id_idx"   ON "purchase_receives" ("purchase_item_id");
CREATE INDEX IF NOT EXISTS "sale_deliveries_sale_item_id_idx"         ON "sale_deliveries" ("sale_item_id");
CREATE INDEX IF NOT EXISTS "sale_item_cost_layers_sale_id_idx"        ON "sale_item_cost_layers" ("sale_id");
CREATE INDEX IF NOT EXISTS "customer_payments_sale_id_idx"            ON "customer_payments" ("sale_id");
CREATE INDEX IF NOT EXISTS "products_supplier_id_idx"                 ON "products" ("supplier_id");
