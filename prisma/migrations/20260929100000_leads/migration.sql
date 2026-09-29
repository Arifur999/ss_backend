-- Leads: shops and offices that might buy, but have not yet.
--
-- marketing_contacts already exists and is deliberately thin - a name and a
-- number typed into the campaign composer. A lead is a different thing: it is
-- noted down after a visit or a call, and weeks later somebody has to pick it
-- up again. That takes the organization, who was spoken to and what their job
-- was, and where the place is. Putting those on marketing_contacts would leave
-- most of its rows with five empty columns.
--
-- Leads become a fifth recipient type on the Marketing page, so a campaign can
-- go to prospects without them first being written into the customer list and
-- polluting every due, ledger and customer report with people who have never
-- bought anything.
--
-- Additive: nothing existing changes, and an older container still serving
-- through the rollover simply never selects this table.

CREATE TABLE IF NOT EXISTS "leads" (
    "id"           TEXT NOT NULL,
    "owner_id"     TEXT NOT NULL,
    "date"         DATE NOT NULL DEFAULT CURRENT_DATE,
    "organization" TEXT NOT NULL,
    "designation"  TEXT NOT NULL DEFAULT '',
    "name"         TEXT NOT NULL,
    "phone"        TEXT NOT NULL,
    "address"      TEXT NOT NULL DEFAULT '',
    "notes"        TEXT NOT NULL DEFAULT '',
    "created_by"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leads_owner_id_idx"      ON "leads"("owner_id");
CREATE INDEX IF NOT EXISTS "leads_owner_id_date_idx" ON "leads"("owner_id", "date" DESC);

-- Cascade: a deleted account takes its prospect list with it, the same as its
-- marketing contacts.
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_owner_id_fkey";
ALTER TABLE "leads" ADD  CONSTRAINT "leads_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
