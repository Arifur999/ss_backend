import "dotenv/config";
import { prisma } from "../src/app/lib/prisma.js";
import { actualDp, roundTaka } from "../src/app/shared/money.js";

// ---------------------------------------------------------------------------
// One-time correction for opening stock priced at the list DP.
//
// A product stores its list DP and the discount negotiated on it separately,
// so the list can print "Tk 11,400 -10%". The opening-stock FIFO batch was
// created at the LIST rate, and every sale costed against that batch recorded
// the list rate as its purchase amount - so the Sales Ledger showed Tk 11,400
// on goods bought at Tk 10,260, and reported that much less profit.
//
// product.service.ts now prices these batches at the discounted DP. This
// repairs what is already in the database:
//   1. opening-stock batches still priced at their product's list DP
//   2. the sale cost layers taken from those batches
//   3. the sale items' cost_price, re-derived from their layers
//
// It also fixes preorder/manual layers (sold with no stock behind them), which
// took the same list rate from the browser.
//
// Only rows whose price still EXACTLY equals the product's current list DP are
// touched, so a batch received at a genuinely different price is left alone,
// and running it twice changes nothing the second time.
//
// Dry run first (prints what it would change, writes nothing):
//   npx tsx scripts/fixOpeningStockDp.ts
// Then apply:
//   npx tsx scripts/fixOpeningStockDp.ts --apply
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply");
const money = (value: unknown) => `Tk ${roundTaka(value).toLocaleString("en-US")}`;

async function main() {
    // Only products that carry a DP discount can have been mispriced.
    const products = await prisma.product.findMany({
        where: { dp_discount: { gt: 0 }, cost_price: { gt: 0 } },
        select: { id: true, product_code: true, name: true, cost_price: true, dp_discount: true },
    });

    if (products.length === 0) {
        console.log("No product carries a DP discount - nothing to correct.");
        return;
    }

    const touchedSaleItemIds = new Set<string>();
    let batchCount = 0;
    let layerCount = 0;

    for (const product of products) {
        const listDp = roundTaka(product.cost_price);
        const finalDp = actualDp(product.cost_price, product.dp_discount);
        if (finalDp === listDp) continue;

        const label = `${product.product_code} ${product.name}`;

        // 1. Opening-stock batches still holding the list rate.
        const batches = await prisma.inventoryBatch.findMany({
            where: { product_id: product.id, source_type: "opening_stock", dp_price: listDp },
            select: { id: true, received_qty: true },
        });

        for (const batch of batches) {
            console.log(`  batch  ${label}: ${money(listDp)} -> ${money(finalDp)} (${batch.received_qty} pcs)`);
            batchCount += 1;
            if (APPLY) {
                await prisma.inventoryBatch.update({
                    where: { id: batch.id },
                    data: { dp_price: finalDp },
                });
            }
        }

        // 2. Cost layers charged at the list rate: the ones taken from those
        //    batches, and the preorder/manual ones the browser priced.
        const batchIds = batches.map(batch => batch.id);
        const layers = await prisma.saleItemCostLayer.findMany({
            where: {
                product_id: product.id,
                dp_price: listDp,
                OR: [
                    ...(batchIds.length > 0 ? [{ inventory_batch_id: { in: batchIds } }] : []),
                    { source_type: { in: ["preorder" as const, "manual" as const] } },
                ],
            },
            select: { id: true, qty: true, sale_item_id: true },
        });

        for (const layer of layers) {
            console.log(`  layer  ${label}: ${layer.qty} x ${money(listDp)} -> ${layer.qty} x ${money(finalDp)}`);
            layerCount += 1;
            if (layer.sale_item_id) touchedSaleItemIds.add(layer.sale_item_id);
            if (APPLY) {
                await prisma.saleItemCostLayer.update({
                    where: { id: layer.id },
                    data: { dp_price: finalDp, cost_amount: roundTaka(layer.qty * finalDp) },
                });
            }
        }
    }

    // 3. Re-derive each affected sale item's unit cost from its layers - the
    //    same average fifo.helpers.ts writes, so the ledger and the reports
    //    read back exactly what a fresh sale would have stored.
    let saleItemCount = 0;
    for (const saleItemId of touchedSaleItemIds) {
        const layers = await prisma.saleItemCostLayer.findMany({
            where: { sale_item_id: saleItemId },
            select: { qty: true, cost_amount: true },
        });
        const qty = layers.reduce((sum, layer) => sum + layer.qty, 0);
        if (qty <= 0) continue;

        const cost = layers.reduce((sum, layer) => sum + Number(layer.cost_amount ?? 0), 0);
        const unitCost = roundTaka(cost / qty);

        const saleItem = await prisma.saleItem.findUnique({
            where: { id: saleItemId },
            select: { product_name: true, cost_price: true, sale: { select: { invoice_no: true } } },
        });
        if (!saleItem || roundTaka(saleItem.cost_price) === unitCost) continue;

        console.log(
            `  sale   ${saleItem.sale?.invoice_no ?? "?"} ${saleItem.product_name}: ` +
            `${money(saleItem.cost_price)} -> ${money(unitCost)}`
        );
        saleItemCount += 1;
        if (APPLY) {
            await prisma.saleItem.update({
                where: { id: saleItemId },
                data: { cost_price: unitCost },
            });
        }
    }

    if (batchCount + layerCount + saleItemCount === 0) {
        console.log("Every opening-stock batch is already priced at its discounted DP - nothing to do.");
        return;
    }

    console.log(
        `\n${APPLY ? "Corrected" : "Would correct"}: ` +
        `${batchCount} opening-stock batch(es), ${layerCount} cost layer(s), ${saleItemCount} sale line(s).`
    );
    if (!APPLY) console.log("Nothing was written. Re-run with --apply to make these changes.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
