-- Give every receive already on the books a memo.
--
-- The Receive Ledger lists memos. Every delivery recorded before memos existed
-- has none, so the ledger opened empty on workspaces with years of receiving
-- behind them - the data was there, in purchase_receives, with nothing to
-- gather it under.
--
-- What counts as one delivery, looking backwards: everything received against
-- ONE purchase order, on ONE day, by ONE person. That is as much as the old
-- rows can tell us. A lorry that settled three orders at once becomes three
-- memos here, which is wrong about the lorry and right about the goods -
-- inventing one memo across orders would claim a fact nobody recorded.
--
-- The memo id is derived from that same group key with md5, so the INSERT and
-- the UPDATE agree about which memo each receive belongs to without a
-- RETURNING clause that cannot carry the key back.
--
-- Vehicle, driver and receiver phone stay empty: they were never captured.
-- pending_after stays null, and the memo sheet prints a dash rather than
-- recomputing a figure nobody signed.

WITH grouped AS (
    SELECT
        r.owner_id,
        r.purchase_id,
        r.receive_date,
        r.receiver_name,
        MIN(r.created_at) AS first_created,
        md5(r.owner_id || ':' || r.purchase_id || ':' || r.receive_date::text || ':' || r.receiver_name)::uuid::text AS memo_id
    FROM purchase_receives r
    WHERE r.memo_id IS NULL
    GROUP BY r.owner_id, r.purchase_id, r.receive_date, r.receiver_name
),
-- The highest number already issued for each workspace and month. Memos made
-- from the app since the feature shipped start at 1001 too, so numbering the
-- backfill from 1001 as well would collide with them and lose rows to the
-- unique index.
issued AS (
    SELECT
        owner_id,
        substring(memo_no FROM 5 FOR 4) AS ym,
        MAX(COALESCE(NULLIF(regexp_replace(substring(memo_no FROM 10), '\D', '', 'g'), '')::int, 0)) AS top
    FROM purchase_receive_memos
    WHERE memo_no LIKE 'RCV-%'
    GROUP BY 1, 2
),
numbered AS (
    SELECT
        g.*,
        GREATEST(COALESCE(i.top, 1000), 1000) + ROW_NUMBER() OVER (
            PARTITION BY g.owner_id, to_char(g.receive_date, 'YYMM')
            ORDER BY g.receive_date, g.first_created, g.purchase_id
        ) AS seq
    FROM grouped g
    LEFT JOIN issued i
      ON i.owner_id = g.owner_id
     AND i.ym = to_char(g.receive_date, 'YYMM')
),
to_insert AS (
    SELECT n.*, p.supplier_id, p.supplier_name
    FROM numbered n
    JOIN purchases p ON p.id = n.purchase_id
)
    INSERT INTO purchase_receive_memos (
        id, owner_id, memo_no, date, supplier_id, supplier_name,
        vehicle_no, driver_name, driver_phone, receiver_name, receiver_phone,
        notes, created_by, created_at
    )
    SELECT
        t.memo_id,
        t.owner_id,
        'RCV-' || to_char(t.receive_date, 'YYMM') || '-' || lpad(t.seq::text, 4, '0'),
        t.receive_date,
        t.supplier_id,
        t.supplier_name,
        '', '', '',
        t.receiver_name,
        '',
        '',
        NULL,
        t.first_created
    FROM to_insert t
    ON CONFLICT DO NOTHING;

-- A SECOND statement, deliberately.
--
-- Every part of one statement sees the same snapshot, taken before it ran, so
-- a WITH that inserts the memos and an UPDATE that looks for them cannot be
-- the same statement: the UPDATE would find none of them and quietly change
-- nothing. (It did, the first time this was written.)
--
-- The group key is recomputed rather than carried over, which is why it is an
-- md5 of the key and not a random id: both statements derive the same value
-- independently.
WITH grouped AS (
    SELECT
        r.owner_id,
        r.purchase_id,
        r.receive_date,
        r.receiver_name,
        md5(r.owner_id || ':' || r.purchase_id || ':' || r.receive_date::text || ':' || r.receiver_name)::uuid::text AS memo_id
    FROM purchase_receives r
    WHERE r.memo_id IS NULL
    GROUP BY r.owner_id, r.purchase_id, r.receive_date, r.receiver_name
)
UPDATE purchase_receives r
SET memo_id = g.memo_id
FROM grouped g
WHERE r.memo_id IS NULL
  AND r.owner_id = g.owner_id
  AND r.purchase_id = g.purchase_id
  AND r.receive_date = g.receive_date
  AND r.receiver_name = g.receiver_name
  -- A memo that was skipped above (its number already taken, somehow) must
  -- not be pointed at: better a receive with no memo than a failed deploy.
  AND EXISTS (SELECT 1 FROM purchase_receive_memos m WHERE m.id = g.memo_id);
