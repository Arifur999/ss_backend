-- Damage: what happens to furniture that breaks.
--
-- Until now the only way to record damage was Inventory -> adjust stock,
-- typing "-5" with a note. That path writes the inventory level, the history
-- row, and walks the FIFO batches decrementing remaining_qty - and then throws
-- the cost away. So the shop could say five chairs left the count and nothing
-- else: not what they were worth, not where they went, not what the repair
-- cost, not whether the supplier ever paid anything back.
--
-- These three tables are shaped like purchases / purchase_items /
-- purchase_receives on purpose, because the flow is the same one: something
-- goes out, some or all of it comes back. The one thing they add is
-- damage_items.unit_cost - the FIFO cost of the stock that actually left,
-- captured at entry, so the loss can be valued rather than only counted.
--
-- The money does NOT get its own table. A repair paid out is an expenses row
-- and a supplier refund is an other_incomes row, each carrying the new
-- damage_entry_id. That way the Balance Dashboard, the P&L, the reports and
-- the Account Ledger are all correct without touching any of them - they
-- already read those two tables. The same reasoning as the loan profit mirror.
--
-- Additive throughout: no existing row changes, and an older container still
-- serving through the rollover simply never selects the new columns.

-- CREATE TYPE has no IF NOT EXISTS, so each enum is guarded by its catalogue.
DO $$ BEGIN
    CREATE TYPE "DamageSource" AS ENUM ('own_stock', 'supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "DamageAction" AS ENUM ('repair', 'return', 'exchange');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "DamageStatus" AS ENUM ('pending', 'partial', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "DamageReceiveResult" AS ENUM ('repaired', 'replaced', 'scrapped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "damage_entries" (
    "id"            TEXT NOT NULL,
    "owner_id"      TEXT NOT NULL,
    "doc_no"        TEXT NOT NULL,
    "date"          DATE NOT NULL DEFAULT CURRENT_DATE,
    "source"        "DamageSource" NOT NULL DEFAULT 'own_stock',
    "action"        "DamageAction" NOT NULL DEFAULT 'repair',
    "supplier_id"   TEXT,
    "supplier_name" TEXT NOT NULL DEFAULT '',
    "status"        "DamageStatus" NOT NULL DEFAULT 'pending',
    "notes"         TEXT NOT NULL DEFAULT '',
    "branch_id"     TEXT,
    "deleted_at"    TIMESTAMP(3),
    "deleted_by"    TEXT,
    "created_by"    TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "damage_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "damage_items" (
    "id"              TEXT NOT NULL,
    "owner_id"        TEXT NOT NULL,
    "damage_entry_id" TEXT NOT NULL,
    "product_id"      TEXT,
    "product_code"    TEXT NOT NULL,
    "product_name"    TEXT NOT NULL,
    "qty"             INTEGER NOT NULL DEFAULT 1,
    "unit_cost"       DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cost"      DECIMAL(15,2) NOT NULL DEFAULT 0,
    "received_qty"    INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "damage_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "damage_receives" (
    "id"              TEXT NOT NULL,
    "owner_id"        TEXT NOT NULL,
    "damage_entry_id" TEXT NOT NULL,
    "damage_item_id"  TEXT NOT NULL,
    "receive_date"    DATE NOT NULL DEFAULT CURRENT_DATE,
    "receiver_name"   TEXT NOT NULL DEFAULT '',
    "received_qty"    INTEGER NOT NULL DEFAULT 0,
    "result"          "DamageReceiveResult" NOT NULL DEFAULT 'repaired',
    "notes"           TEXT NOT NULL DEFAULT '',
    "created_by"      TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "damage_receives_pkey" PRIMARY KEY ("id")
);

-- Which batches the damaged goods actually came off, and at what price - the
-- same job sale_item_cost_layers does for a sale. Without it, deleting an
-- entry could put the quantity back but not onto the batches it was taken
-- from, so FIFO order and per-batch value would drift a little further apart
-- every time somebody corrected a mistake. A NULL inventory_batch_id is the
-- shortfall: goods damaged that the batch table had no record of.
CREATE TABLE IF NOT EXISTS "damage_cost_layers" (
    "id"                 TEXT NOT NULL,
    "owner_id"           TEXT NOT NULL,
    "damage_item_id"     TEXT NOT NULL,
    "inventory_batch_id" TEXT,
    "qty"                INTEGER NOT NULL DEFAULT 0,
    "dp_price"           DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_amount"        DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "damage_cost_layers_pkey" PRIMARY KEY ("id")
);

-- Which entry paid for what, and which was paid back for what.
ALTER TABLE "expenses"      ADD COLUMN IF NOT EXISTS "damage_entry_id" TEXT;
ALTER TABLE "other_incomes" ADD COLUMN IF NOT EXISTS "damage_entry_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "damage_entries_owner_id_doc_no_key" ON "damage_entries"("owner_id", "doc_no");
CREATE INDEX IF NOT EXISTS "damage_entries_owner_id_idx"          ON "damage_entries"("owner_id");
CREATE INDEX IF NOT EXISTS "damage_entries_date_idx"              ON "damage_entries"("date");
CREATE INDEX IF NOT EXISTS "damage_entries_supplier_id_idx"       ON "damage_entries"("supplier_id");
CREATE INDEX IF NOT EXISTS "damage_entries_owner_id_date_idx"     ON "damage_entries"("owner_id", "date" DESC);

CREATE INDEX IF NOT EXISTS "damage_items_owner_id_idx"            ON "damage_items"("owner_id");
CREATE INDEX IF NOT EXISTS "damage_items_damage_entry_id_idx"     ON "damage_items"("damage_entry_id");
CREATE INDEX IF NOT EXISTS "damage_items_product_id_idx"          ON "damage_items"("product_id");

CREATE INDEX IF NOT EXISTS "damage_receives_owner_id_idx"         ON "damage_receives"("owner_id");
CREATE INDEX IF NOT EXISTS "damage_receives_damage_entry_id_idx"  ON "damage_receives"("damage_entry_id");
CREATE INDEX IF NOT EXISTS "damage_receives_damage_item_id_idx"   ON "damage_receives"("damage_item_id");

CREATE INDEX IF NOT EXISTS "damage_cost_layers_owner_id_idx"           ON "damage_cost_layers"("owner_id");
CREATE INDEX IF NOT EXISTS "damage_cost_layers_damage_item_id_idx"     ON "damage_cost_layers"("damage_item_id");
CREATE INDEX IF NOT EXISTS "damage_cost_layers_inventory_batch_id_idx" ON "damage_cost_layers"("inventory_batch_id");

-- The guards on the Expenses and Other Income pages count by these on every
-- edit and delete, so they are worth an index each.
CREATE INDEX IF NOT EXISTS "expenses_damage_entry_id_idx"         ON "expenses"("damage_entry_id");
CREATE INDEX IF NOT EXISTS "other_incomes_damage_entry_id_idx"    ON "other_incomes"("damage_entry_id");

-- Dropped first so the migration can be re-run against a half-applied database.
ALTER TABLE "damage_entries"  DROP CONSTRAINT IF EXISTS "damage_entries_supplier_id_fkey";
ALTER TABLE "damage_entries"  ADD  CONSTRAINT "damage_entries_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "damage_items"    DROP CONSTRAINT IF EXISTS "damage_items_damage_entry_id_fkey";
ALTER TABLE "damage_items"    ADD  CONSTRAINT "damage_items_damage_entry_id_fkey"
    FOREIGN KEY ("damage_entry_id") REFERENCES "damage_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "damage_items"    DROP CONSTRAINT IF EXISTS "damage_items_product_id_fkey";
ALTER TABLE "damage_items"    ADD  CONSTRAINT "damage_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "damage_receives" DROP CONSTRAINT IF EXISTS "damage_receives_damage_entry_id_fkey";
ALTER TABLE "damage_receives" ADD  CONSTRAINT "damage_receives_damage_entry_id_fkey"
    FOREIGN KEY ("damage_entry_id") REFERENCES "damage_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "damage_receives" DROP CONSTRAINT IF EXISTS "damage_receives_damage_item_id_fkey";
ALTER TABLE "damage_receives" ADD  CONSTRAINT "damage_receives_damage_item_id_fkey"
    FOREIGN KEY ("damage_item_id") REFERENCES "damage_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "damage_cost_layers" DROP CONSTRAINT IF EXISTS "damage_cost_layers_damage_item_id_fkey";
ALTER TABLE "damage_cost_layers" ADD  CONSTRAINT "damage_cost_layers_damage_item_id_fkey"
    FOREIGN KEY ("damage_item_id") REFERENCES "damage_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL so a batch that is cleaned up later does not take the record of
-- what the damage cost with it.
ALTER TABLE "damage_cost_layers" DROP CONSTRAINT IF EXISTS "damage_cost_layers_inventory_batch_id_fkey";
ALTER TABLE "damage_cost_layers" ADD  CONSTRAINT "damage_cost_layers_inventory_batch_id_fkey"
    FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting a damage entry must never take a booked
-- expense or a received refund off the P&L with it.
ALTER TABLE "expenses"        DROP CONSTRAINT IF EXISTS "expenses_damage_entry_id_fkey";
ALTER TABLE "expenses"        ADD  CONSTRAINT "expenses_damage_entry_id_fkey"
    FOREIGN KEY ("damage_entry_id") REFERENCES "damage_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "other_incomes"   DROP CONSTRAINT IF EXISTS "other_incomes_damage_entry_id_fkey";
ALTER TABLE "other_incomes"   ADD  CONSTRAINT "other_incomes_damage_entry_id_fkey"
    FOREIGN KEY ("damage_entry_id") REFERENCES "damage_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
