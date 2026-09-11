import "dotenv/config";
import { prisma } from "../src/app/lib/prisma.js";
import { openingStockCost, purchaseReceiveCost, verdictFor } from "../src/app/shared/batchCost.js";
import { roundTaka } from "../src/app/shared/money.js";

// ---------------------------------------------------------------------------
// Repair FIFO batches that were priced at the list rate instead of the
// discounted one, and everything costed against them.
//
// A product stores its list DP and the discount negotiated on it separately,
// so a price list can print "Tk 11,400 -10%". Two paths used to write the LIST
// figure into the stock batch that every sale is costed against:
//
//   opening stock      took product.cost_price, ignoring dp_discount
//   purchase receive   took purchase_item.dp_price whenever actual_dp was left
//                      at its 0 default, ignoring discount_pct
//
// Either way the Sales Ledger reported Tk 11,400 on goods bought at Tk 10,260
// and understated the profit by the difference - and because only SOME stock
// came in that way, the same product reads at different rates from one invoice
// to the next. Both write paths are fixed; this repairs the rows already on
// the books, in three layers:
//
//   1. the batch's dp_price
//   2. the sale cost layers taken from that batch
//   3. each affected sale item's cost_price, re-derived from its layers -
//      the same average fifo.helpers.ts writes, so the ledger and the reports
//      read back exactly what a fresh sale would have stored
//
// WHAT IT DOES NOT TOUCH: quantities, inventory levels, cash, or any account
// balance. Only what goods cost. The visible effect is that reported PROFIT
// rises, across every month that sold the affected stock - which is the
// correction, not a side effect. Stock value on the Inventory page falls by
// the same logic, because it was overstated too.
//
// The rule for what counts as wrong lives in shared/batchCost.ts, where a test
// covers it. It is deliberately narrow: a batch is only repriced when it holds
// EXACTLY the list rate and the discount says it should have been less. A
// batch genuinely received at some other price is left alone, and a batch
// already repaired no longer matches - so this is safe to run twice.
//
// Dry run first. It writes nothing and prints every row it would change:
//   npx tsx scripts/fixBatchCosts.ts
// Then apply, after a backup:
//   npx tsx scripts/fixBatchCosts.ts --apply
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply");
const money = (value: unknown) => `Tk ${roundTaka(value).toLocaleString("en-US")}`;

type Plan = {
    batchId: string;
    label: string;
    kind: "opening stock" | "purchase receive";
    from: number;
    to: number;
    qty: number;
};

async function planOpeningStock(): Promise<Plan[]> {
    const products = await prisma.product.findMany({
        where: { dp_discount: { gt: 0 }, cost_price: { gt: 0 } },
        select: { id: true, product_code: true, name: true, cost_price: true, dp_discount: true },
    });

    const plans: Plan[] = [];

    for (const product of products) {
        const batches = await prisma.inventoryBatch.findMany({
            where: { product_id: product.id, source_type: "opening_stock" },
            select: { id: true, dp_price: true, received_qty: true },
        });

        for (const batch of batches) {
            // Compared in whole taka rather than matched in the query, so a
            // list price carrying paisa is caught instead of silently skipped.
            const verdict = verdictFor({
                current: batch.dp_price,
                listPrice: product.cost_price,
                correct: openingStockCost(product),
            });
            if (!verdict.reprice) continue;

            plans.push({
                batchId: batch.id,
                label: `${product.product_code} ${product.name}`,
                kind: "opening stock",
                from: verdict.from,
                to: verdict.to,
                qty: batch.received_qty,
            });
        }
    }

    return plans;
}

async function planPurchaseReceives(): Promise<Plan[]> {
    // Only items that carry a discount can have been mispriced, and only those
    // whose actual_dp was never filled in - with it, the batch already took the
    // right figure.
    const items = await prisma.purchaseItem.findMany({
        where: { discount_pct: { gt: 0 }, dp_price: { gt: 0 } },
        select: {
            id: true, product_code: true, product_name: true,
            dp_price: true, discount_pct: true, actual_dp: true,
            inventory_batches: { select: { id: true, dp_price: true, received_qty: true } },
        },
    });

    const plans: Plan[] = [];

    for (const item of items) {
        const correct = purchaseReceiveCost(item);

        for (const batch of item.inventory_batches) {
            const verdict = verdictFor({
                current: batch.dp_price,
                listPrice: item.dp_price,
                correct,
            });
            if (!verdict.reprice) continue;

            plans.push({
                batchId: batch.id,
                label: `${item.product_code} ${item.product_name}`,
                kind: "purchase receive",
                from: verdict.from,
                to: verdict.to,
                qty: batch.received_qty,
            });
        }
    }

    return plans;
}

async function main() {
    const plans = [...(await planOpeningStock()), ...(await planPurchaseReceives())];

    if (plans.length === 0) {
        console.log("Every stock batch is priced at what it cost. Nothing to correct.");
        console.log("Any difference you see between two sales of one product is FIFO:");
        console.log("stock leaves oldest batch first, so batches bought at different");
        console.log("prices cost different amounts - which is correct.");
        return;
    }

    console.log(`${plans.length} batch(es) priced at the list rate:\n`);
    for (const plan of plans) {
        console.log(`  ${plan.kind.padEnd(17)} ${plan.label}: ${money(plan.from)} -> ${money(plan.to)} (${plan.qty} pcs)`);
    }

    // ---- the layers charged against those batches ----
    const batchIds = plans.map(plan => plan.batchId);
    const priceByBatch = new Map(plans.map(plan => [plan.batchId, plan.to]));

    const layers = await prisma.saleItemCostLayer.findMany({
        where: { inventory_batch_id: { in: batchIds } },
        select: { id: true, qty: true, sale_item_id: true, inventory_batch_id: true, cost_amount: true },
    });

    const touchedSaleItemIds = new Set<string>();
    let costCorrected = 0;

    for (const layer of layers) {
        const unit = priceByBatch.get(layer.inventory_batch_id as string);
        if (unit === undefined) continue;
        const nextAmount = roundTaka(layer.qty * unit);
        costCorrected += roundTaka(layer.cost_amount) - nextAmount;
        if (layer.sale_item_id) touchedSaleItemIds.add(layer.sale_item_id);
    }

    console.log(`\n${layers.length} sale cost layer(s) on ${touchedSaleItemIds.size} sale line(s) were charged against them.`);
    console.log(`Reported profit will RISE by about ${money(costCorrected)} in total, spread over the months those sales are in.`);

    if (!APPLY) {
        console.log("\nDry run - nothing written. Take a backup, then re-run with --apply.");
        return;
    }

    for (const plan of plans) {
        await prisma.inventoryBatch.update({ where: { id: plan.batchId }, data: { dp_price: plan.to } });
    }

    for (const layer of layers) {
        const unit = priceByBatch.get(layer.inventory_batch_id as string);
        if (unit === undefined) continue;
        await prisma.saleItemCostLayer.update({
            where: { id: layer.id },
            data: { dp_price: unit, cost_amount: roundTaka(layer.qty * unit) },
        });
    }

    // Re-derive from ALL of a line's layers, not just the repriced ones: a line
    // split across two batches keeps the untouched half at its own cost.
    let saleItemCount = 0;
    for (const saleItemId of touchedSaleItemIds) {
        const all = await prisma.saleItemCostLayer.findMany({
            where: { sale_item_id: saleItemId },
            select: { qty: true, cost_amount: true },
        });
        const qty = all.reduce((sum, layer) => sum + layer.qty, 0);
        if (qty <= 0) continue;

        const total = all.reduce((sum, layer) => sum + Number(layer.cost_amount ?? 0), 0);
        await prisma.saleItem.update({
            where: { id: saleItemId },
            data: { cost_price: roundTaka(total / qty) },
        });
        saleItemCount += 1;
    }

    console.log(`\nRepriced ${plans.length} batch(es), ${layers.length} layer(s) and ${saleItemCount} sale line(s).`);
    console.log("Check the Sales Ledger: one product should now read the same rate");
    console.log("on every invoice drawing from the same batch.");
}

main()
    .catch((error) => {
        console.error("Batch cost repair failed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
