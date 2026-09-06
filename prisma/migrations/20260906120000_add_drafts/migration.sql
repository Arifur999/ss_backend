-- Somewhere to park an unfinished purchase order or invoice.
--
-- Not a status on `purchases` / `sales`: a draft is a saved FORM, not an order.
-- It is usually incomplete, which the real create validators refuse, and a
-- half-written row in those tables would quietly move real numbers - the
-- inventory page aggregates purchase_items and sale_items without joining back
-- to their parent, supplier and customer dues are derived from due_amount, the
-- sales ledger sums net_amount over every row, and writing the row is itself
-- what reserves an si_no / invoice_no.
--
-- Nothing else reads this table, so none of that can happen here.
--
-- Purely additive: an older container still serving through the rollover simply
-- ignores a table it does not know about.

CREATE TABLE IF NOT EXISTS "drafts" (
    "id"         TEXT NOT NULL,
    "owner_id"   TEXT NOT NULL,
    -- "purchase_order" | "sale". Plain text like recycle_bin_items.type.
    "kind"       TEXT NOT NULL,
    -- Supplier or customer name, and the si_no / invoice_no, so the draft list
    -- can be read without opening every snapshot.
    "title"      TEXT NOT NULL DEFAULT '',
    "subtitle"   TEXT NOT NULL DEFAULT '',
    "amount"     DECIMAL(15,2) NOT NULL DEFAULT 0,
    -- The form, exactly as it stood. Opaque to the server.
    "data"       JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- Every read is "this workspace's drafts of this kind, newest first".
CREATE INDEX IF NOT EXISTS "drafts_owner_id_kind_idx" ON "drafts"("owner_id", "kind");
