-- A delivery, as opposed to a received line.
--
-- purchase_receives has always been one row per product. The Receive Ledger
-- needs the thing those rows arrived in: one lorry, one supplier, one person
-- who signed for it, possibly covering several purchase orders.
--
-- Additive on purpose. memo_id is nullable, so every receive recorded before
-- today - and every one the Product Received page still makes one line at a
-- time - stays exactly as it is and simply has no memo.

CREATE TABLE "purchase_receive_memos" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "memo_no" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "vehicle_no" TEXT NOT NULL DEFAULT '',
    "driver_name" TEXT NOT NULL DEFAULT '',
    "driver_phone" TEXT NOT NULL DEFAULT '',
    "receiver_name" TEXT NOT NULL,
    "receiver_phone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receive_memos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_receive_memos_owner_id_memo_no_key" ON "purchase_receive_memos"("owner_id", "memo_no");
CREATE INDEX "purchase_receive_memos_owner_id_idx" ON "purchase_receive_memos"("owner_id");
CREATE INDEX "purchase_receive_memos_owner_id_date_idx" ON "purchase_receive_memos"("owner_id", "date" DESC);

ALTER TABLE "purchase_receive_memos"
    ADD CONSTRAINT "purchase_receive_memos_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_receives" ADD COLUMN "memo_id" TEXT;

CREATE INDEX "purchase_receives_memo_id_idx" ON "purchase_receives"("memo_id");

-- SET NULL, not CASCADE: deleting a memo is handled in the service, which
-- reverses the stock line by line first. A cascade here would silently drop
-- the receive rows and leave inventory holding products nobody received.
ALTER TABLE "purchase_receives"
    ADD CONSTRAINT "purchase_receives_memo_id_fkey"
    FOREIGN KEY ("memo_id") REFERENCES "purchase_receive_memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
