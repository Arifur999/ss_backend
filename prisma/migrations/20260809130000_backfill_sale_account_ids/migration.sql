-- One-time backfill of account_id from the legacy account_name text.
--
-- The Sales page used to do this on the client, on every single load: it read
-- every sale, found the ones still carrying a name instead of an id, and fired
-- one PATCH per row. That storm of writes also cleared the browser's read
-- cache, so the reads that followed had to fetch everything again. Doing it
-- once here lets that code go.
--
-- The match repeats what the page did - lowercase, collapse runs of
-- whitespace, trim - so exactly the same rows are paired up. Anything with no
-- matching account is left untouched, exactly as before.

UPDATE sales s
SET account_id = a.id,
    account_name = ''
FROM accounts a
WHERE (s.account_id IS NULL OR s.account_id = '')
  AND s.account_name <> ''
  AND a.owner_id = s.owner_id
  AND lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(s.account_name), '\s+', ' ', 'g'));

UPDATE sale_payments p
SET account_id = a.id,
    account_name = ''
FROM accounts a
WHERE (p.account_id IS NULL OR p.account_id = '')
  AND p.account_name <> ''
  AND a.owner_id = p.owner_id
  AND lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(p.account_name), '\s+', ' ', 'g'));
