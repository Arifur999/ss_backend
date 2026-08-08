-- Indexes for the queries the list pages actually run.
--
-- Every list is "this owner's rows, not deleted, newest first", and the big
-- ones are searched by name or code. Without these, Postgres reads and sorts
-- the whole table for each request - fine at a few hundred rows, not at ten
-- thousand.
--
-- pg_trgm is what makes a "contains" search indexable at all: a plain btree
-- can only help when the pattern starts with a literal, and this search is
-- ILIKE '%term%' by design, because it has to behave like the browser's
-- .includes(). A GIN trigram index handles the leading wildcard.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- products: the list query, and the code/name search over it
CREATE INDEX IF NOT EXISTS "products_owner_deleted_created_idx"
    ON "products" ("owner_id", "deleted_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
    ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_code_trgm_idx"
    ON "products" USING GIN ("product_code" gin_trgm_ops);

-- inventory: always read per owner, and the stock page asks for the rows with
-- no branch
CREATE INDEX IF NOT EXISTS "inventory_owner_branch_idx"
    ON "inventory" ("owner_id", "branch_id");

-- customers: same list shape, plus name/phone lookup from the sale form
CREATE INDEX IF NOT EXISTS "customers_owner_created_idx"
    ON "customers" ("owner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx"
    ON "customers" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx"
    ON "customers" USING GIN ("phone" gin_trgm_ops);

-- sales: the ledger is owner + date desc, and it is searched by invoice number
CREATE INDEX IF NOT EXISTS "sales_owner_deleted_date_idx"
    ON "sales" ("owner_id", "deleted_at", "date" DESC);
CREATE INDEX IF NOT EXISTS "sales_invoice_trgm_idx"
    ON "sales" USING GIN ("invoice_no" gin_trgm_ops);

-- the child tables every sale page joins through
CREATE INDEX IF NOT EXISTS "sale_items_sale_id_idx" ON "sale_items" ("sale_id");
CREATE INDEX IF NOT EXISTS "sale_payments_sale_id_idx" ON "sale_payments" ("sale_id");
CREATE INDEX IF NOT EXISTS "inventory_history_product_id_idx" ON "inventory_history" ("product_id");
