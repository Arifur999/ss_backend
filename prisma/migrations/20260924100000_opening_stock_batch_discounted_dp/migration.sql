-- Price opening-stock batches at the DP after its discount, not the list DP.
--
-- An opening-stock batch is written once, when the product is created, and
-- until today nothing ever looked at it again. So a product entered at its
-- list DP and given its dp_discount afterwards kept a batch holding the list
-- rate for good.
--
-- That batch is what FIFO charges every sale against. A wardrobe showing
-- "DP Rate Tk 19,300 -10%, Final DP Tk 17,370" on the Product List therefore
-- sold with a Purchase Amount of Tk 19,300 on the Sales Ledger, and went on
-- doing it for as long as the opening stock lasted - understating the profit
-- on each sale by Tk 1,930. Only products carrying opening quantity are
-- affected: a purchase-receive batch takes its price from the purchase line.
--
-- product.service.ts now reprices these batches whenever the owner edits the
-- product's rate or discount, so it cannot happen again. This repairs the rows
-- already on the books, because the alternative was asking every owner to open
-- and re-save each product with opening stock.
--
-- Deliberately narrow, and safe to re-run. A batch is only touched when it
-- holds EXACTLY the product's current list rate, which is the fingerprint the
-- old code left. A batch priced at anything else was priced by something that
-- knew better - stock bought at a different rate, or a row already repaired -
-- and is left alone.
--
-- What this does NOT touch: sale_item_cost_layers and sale_items.cost_price on
-- sales already made. Those are what past invoices reported, and rewriting
-- them restates the profit of months that have been closed and quoted. Future
-- sales draw the corrected price from here; scripts/fixBatchCosts.ts restates
-- the past deliberately, with a dry run that prints the impact first.

UPDATE "inventory_batches" AS b
SET "dp_price" = ROUND(ROUND(p."cost_price") - (ROUND(p."cost_price") * COALESCE(p."dp_discount", 0) / 100))
FROM "products" AS p
WHERE b."product_id" = p."id"
  AND b."owner_id" = p."owner_id"
  AND b."source_type" = 'opening_stock'
  AND COALESCE(p."dp_discount", 0) > 0
  AND ROUND(b."dp_price") = ROUND(p."cost_price")
  AND ROUND(ROUND(p."cost_price") - (ROUND(p."cost_price") * COALESCE(p."dp_discount", 0) / 100)) <> ROUND(b."dp_price");
