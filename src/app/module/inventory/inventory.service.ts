import status from "http-status";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { pageSlice, type ListOptions } from "../../shared/listQuery.js";
import { adjustInventoryLevel } from "./fifo.helpers.js";
import { IAdjustInventoryPayload } from "./inventory.validation.js";

// Supabase join shape: inventory rows carry `products` relation key.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toSupabaseShape = (row: any) => {
    if (!row) return row;
    const { product, ...rest } = row;
    return { ...rest, products: product ?? null };
};

// One page of the stock list, with every quantity worked out in SQL.
//
// The page used to do this in the browser: it pulled products, inventory,
// inventory_history, purchase_items, purchase_receives, sale_items and
// inventory_batches in full, then joined them by hand. That is six tables and
// several megabytes to show forty rows, and it cannot survive ten thousand
// products.
//
// The arithmetic below is a transcription of what that code did, kept
// deliberately literal so the figures do not move:
//
//   order     = sum of purchase_items.qty
//   received  = sum of GREATEST(purchase_items.received_qty, sum of its receives)
//   upcoming  = sum of GREATEST(0, qty - received)      (per purchase item)
//   sales     = sum of sale_items.qty
//   opening   = GREATEST(products.opening_qty, opening-stock batch qty)
//   available = opening + received + upcoming - sales
//   dp        = inventory.dp_price, else products.cost_price, else 0
//   value     = available * dp
//
// One thing deliberately NOT carried over: the old code also looked for
// inventory_history rows with change_type 'opening_stock'. That value is not
// in the InventoryChangeType enum, so the branch never matched anything - it
// only cost a full table fetch on every load.
const inventoryRowsSql = (user: IRequestUser, search: string | undefined, statusFilter: string | undefined) => {
    const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

    return Prisma.sql`
        WITH base AS (
            SELECT
                p.id                AS product_id,
                p.name              AS product_name,
                p.product_code      AS product_code,
                p.image_url         AS image_url,
                p.cost_price        AS cost_price,
                p.opening_qty       AS product_opening_qty,
                s.name              AS supplier_name,
                s.company_name      AS supplier_company,
                inv.id              AS inventory_id,
                inv.dp_price        AS dp_price,
                inv.available_qty   AS ledger_qty,
                COALESCE(batch.opening_qty, 0)   AS batch_opening_qty,
                COALESCE(po.order_qty, 0)        AS order_qty,
                COALESCE(po.received_qty, 0)     AS received_qty,
                COALESCE(po.upcoming_qty, 0)     AS upcoming_qty,
                COALESCE(si.sales_qty, 0)        AS sales_qty
            FROM products p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            -- owner_id here as well: inventory is unique per (owner, product),
            -- so without it a row another workspace held against the same
            -- product id would join in and duplicate the line.
            LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.branch_id IS NULL
                AND inv.owner_id = ${user.ownerId}
            -- Each of these aggregates is scoped to the owner. Without that
            -- predicate they group EVERY tenant's rows to answer one owner's
            -- page: the result was still correct, because the product ids they
            -- join back to are owner-scoped, but the work grew with the size of
            -- the whole database rather than this account.
            LEFT JOIN (
                SELECT product_id, MAX(received_qty) AS opening_qty
                FROM inventory_batches
                WHERE source_type = 'opening_stock'
                  AND owner_id = ${user.ownerId}
                GROUP BY product_id
            ) batch ON batch.product_id = p.id
            LEFT JOIN (
                SELECT pi.product_id,
                       SUM(pi.qty) AS order_qty,
                       SUM(GREATEST(pi.received_qty, COALESCE(r.received, 0))) AS received_qty,
                       SUM(GREATEST(0, pi.qty - GREATEST(pi.received_qty, COALESCE(r.received, 0)))) AS upcoming_qty
                FROM purchase_items pi
                LEFT JOIN (
                    SELECT purchase_item_id, SUM(received_qty) AS received
                    FROM purchase_receives
                    WHERE owner_id = ${user.ownerId}
                    GROUP BY purchase_item_id
                ) r ON r.purchase_item_id = pi.id
                WHERE pi.owner_id = ${user.ownerId}
                GROUP BY pi.product_id
            ) po ON po.product_id = p.id
            LEFT JOIN (
                SELECT product_id, SUM(qty) AS sales_qty
                FROM sale_items
                WHERE owner_id = ${user.ownerId}
                GROUP BY product_id
            ) si ON si.product_id = p.id
            WHERE p.owner_id = ${user.ownerId}
              AND p.deleted_at IS NULL
              AND p.is_active = true
              ${like ? Prisma.sql`AND (p.name ILIKE ${like} OR p.product_code ILIKE ${like})` : Prisma.empty}
        ),
        computed AS (
            SELECT *,
                -- GREATEST, not a sum: a product carries its opening quantity on
                -- its own row AND as an 'opening_stock' batch, and they describe
                -- the same goods. Adding them counted the opening stock twice.
                GREATEST(COALESCE(product_opening_qty, 0), batch_opening_qty) AS opening_qty,
                -- What is actually on the floor: opening plus what has been
                -- RECEIVED, less what has been sold. upcoming_qty is deliberately
                -- not in here.
                --
                -- It used to be, and because received_qty is
                -- SUM(GREATEST(pi.received_qty, r.received)) while upcoming_qty is
                -- SUM(GREATEST(0, pi.qty - that)), the two add back up to the
                -- quantity ORDERED. So available_qty was opening + ordered - sold:
                -- a purchase order for fifty sofas that had not shipped yet showed
                -- fifty in stock and put their whole value into Total Stock Value.
                -- It also meant a sold-out product with an open order could never
                -- report 'out_of_stock' or 'upcoming', because available_qty had
                -- already swallowed the upcoming figure.
                --
                -- upcoming_qty stays in the SELECT below as its own column, which
                -- is what the Inventory page's Upcoming column and its 'upcoming'
                -- status badge read.
                --
                -- available_qty comes from inventory.available_qty - the running
                -- ledger every stock movement writes to - and only falls back to
                -- this computed figure for a product that has no inventory row at
                -- all (created before the app maintained one).
                --
                -- It used to be the computed figure alone, and the two disagreed
                -- for good. The computed one is opening + received - sold, which
                -- knows nothing about a manual adjustment: five damaged chairs
                -- adjusted to -5 never changed this page, forever, while the Sales
                -- page (which reads the ledger column) dropped by five. Same
                -- product, same second, two numbers, and the salesperson's
                -- "Stock: 0" warning came from one while the stock report came
                -- from the other.
                --
                -- The ledger can also go negative, which the computed figure
                -- cannot express and which the owner needs to see: it means goods
                -- were sold that had not arrived.
                COALESCE(
                    ledger_qty,
                    GREATEST(COALESCE(product_opening_qty, 0), batch_opening_qty)
                        + received_qty - sales_qty
                ) AS available_qty,
                -- Kept and returned beside it, so the two can be compared. The
                -- difference between them is exactly the manual adjustments.
                GREATEST(COALESCE(product_opening_qty, 0), batch_opening_qty)
                    + received_qty - sales_qty AS computed_qty,
                COALESCE(dp_price, cost_price, 0) AS unit_dp
            FROM base
        )
        SELECT *, (available_qty * unit_dp) AS stock_value
        FROM computed
        -- These three have to partition the rows exactly the way the Inventory
        -- page's own getStatus() badges them, or filtering by one status returns
        -- rows wearing another status's badge. Nothing on hand but stock on the
        -- way reads as Upcoming, not Out of Stock - so 'upcoming' is only the
        -- rows with no stock and something coming, and 'out_of_stock' is only the
        -- rows with no stock and nothing coming.
        ${statusFilter === "available" ? Prisma.sql`WHERE available_qty > 0`
            : statusFilter === "out_of_stock" ? Prisma.sql`WHERE available_qty <= 0 AND upcoming_qty <= 0`
            : statusFilter === "upcoming" ? Prisma.sql`WHERE available_qty <= 0 AND upcoming_qty > 0`
            : Prisma.empty}
    `;
};

export interface InventoryListOptions extends ListOptions {
    status?: string;
}

const getInventoryList = async (user: IRequestUser, options: InventoryListOptions = {}) => {
    const rows = inventoryRowsSql(user, options.search, options.status);
    const slice = pageSlice(options);

    // The totals are over every matching row, not the page - a stock value
    // that only counted the rows scrolled into view would be worse than no
    // total at all. They ride along as window functions rather than a second
    // query, because each one builds the whole aggregate above: asking twice
    // did all of that work twice. count/sum OVER () are evaluated before
    // LIMIT, so they still describe every matching row, not just this page.
    const page = await prisma.$queryRaw<Record<string, unknown>[]>(
        slice
            ? Prisma.sql`SELECT *, count(*) OVER () AS total_rows, COALESCE(SUM(stock_value) OVER (), 0) AS total_value
                         FROM (${rows}) t ORDER BY product_code ASC LIMIT ${slice.take} OFFSET ${slice.skip}`
            : Prisma.sql`SELECT *, count(*) OVER () AS total_rows, COALESCE(SUM(stock_value) OVER (), 0) AS total_value
                         FROM (${rows}) t ORDER BY product_code ASC`
    );

    // An empty page carries no window values. That happens when the requested
    // page is past the end (rows deleted since the count was taken), so fall
    // back to the aggregate-only query rather than reporting zero stock.
    let totals = page[0] as { total_rows?: bigint; total_value?: string | null } | undefined;
    if (!page.length) {
        [totals] = await prisma.$queryRaw<{ total_rows: bigint; total_value: string | null }[]>(
            Prisma.sql`SELECT count(*) AS total_rows, COALESCE(SUM(stock_value), 0) AS total_value FROM (${rows}) t`
        );
    }

    return {
        rows: page.map((row) => ({
            id: row.inventory_id ?? `product:${row.product_id}`,
            product_id: row.product_id,
            dp_price: row.dp_price,
            opening_qty: Number(row.opening_qty ?? 0),
            order_qty: Number(row.order_qty ?? 0),
            received_qty: Number(row.received_qty ?? 0),
            upcoming_qty: Number(row.upcoming_qty ?? 0),
            sales_qty: Number(row.sales_qty ?? 0),
            available_qty: Number(row.available_qty ?? 0),
            // What opening + received - sold comes to, alongside the ledger figure
            // above. They differ by exactly the manual adjustments, so shipping
            // both means a discrepancy is visible rather than hidden - and if the
            // ledger ever drifts (a stock path that forgets to maintain it), this
            // is what a recalculation would compare against.
            computed_qty: Number(row.computed_qty ?? 0),
            fifo_average_dp: Number(row.unit_dp ?? 0),
            fifo_stock_value: Number(row.stock_value ?? 0),
            products: {
                id: row.product_id,
                name: row.product_name,
                product_code: row.product_code,
                image_url: row.image_url,
                cost_price: row.cost_price,
                suppliers: row.supplier_name || row.supplier_company
                    ? { name: row.supplier_name, company_name: row.supplier_company }
                    : null,
            },
        })),
        total: Number(totals?.total_rows ?? 0),
        totalStockValue: Number(totals?.total_value ?? 0),
    };
};

const getAllInventory = async (user: IRequestUser) => {
    const rows = await prisma.inventory.findMany({
        where: { owner_id: user.ownerId },
        include: { product: true },
        orderBy: { updated_at: "desc" },
    });
    return rows.map(toSupabaseShape);
};

const getInventoryHistory = async (user: IRequestUser, productId?: string) => {
    return prisma.inventoryHistory.findMany({
        where: {
            owner_id: user.ownerId,
            ...(productId ? { product_id: productId } : {}),
        },
        orderBy: { created_at: "desc" },
        take: 500,
    });
};

const getInventoryBatches = async (user: IRequestUser, productId?: string) => {
    return prisma.inventoryBatch.findMany({
        where: {
            owner_id: user.ownerId,
            ...(productId ? { product_id: productId } : {}),
        },
        orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
    });
};

// Manual stock adjustment (Inventory page): updates level + history, and
// keeps FIFO batches in sync (increase -> new adjustment batch; decrease ->
// consume oldest batches).
const adjustInventory = async (payload: IAdjustInventoryPayload, user: IRequestUser) => {
    const product = await prisma.product.findFirst({
        where: { id: payload.product_id, owner_id: user.ownerId },
    });

    if (!product) {
        throw new AppError(status.NOT_FOUND, "Product not found");
    }

    return prisma.$transaction(async (tx) => {
        const inventory = await adjustInventoryLevel(
            tx,
            {
                productId: payload.product_id,
                productName: payload.product_name,
                qtyChange: payload.qty_change,
                changeType: "adjustment",
                referenceType: "manual_adjustment",
                notes: payload.notes ?? "Manual adjustment",
            },
            user
        );

        if (payload.qty_change > 0) {
            await tx.inventoryBatch.create({
                data: {
                    owner_id: user.ownerId,
                    product_id: payload.product_id,
                    source_type: "adjustment",
                    received_qty: payload.qty_change,
                    remaining_qty: payload.qty_change,
                    dp_price: payload.dp_price ?? product.cost_price,
                    mrp_price: payload.mrp_price ?? product.selling_price,
                    received_date: new Date(),
                    created_by: user.userId,
                },
            });
        } else if (payload.qty_change < 0) {
            let toRemove = Math.abs(payload.qty_change);
            const batches = await tx.inventoryBatch.findMany({
                where: { owner_id: user.ownerId, product_id: payload.product_id, remaining_qty: { gt: 0 } },
                orderBy: [{ received_date: "asc" }, { created_at: "asc" }],
            });
            for (const batch of batches) {
                if (toRemove <= 0) break;
                const take = Math.min(batch.remaining_qty, toRemove);
                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: { remaining_qty: batch.remaining_qty - take },
                });
                toRemove -= take;
            }
        }

        return inventory;
    });
};

// Manual DP price override from the Inventory page: syncs the inventory row
// and the product's opening stock batches.
const setDpPrice = async (productId: string, dpPrice: number | null, user: IRequestUser) => {
    const inventory = await prisma.inventory.findUnique({
        where: { owner_id_product_id: { owner_id: user.ownerId, product_id: productId } },
    });

    if (!inventory) {
        throw new AppError(status.NOT_FOUND, "Inventory row not found");
    }

    return prisma.$transaction(async (tx) => {
        const updated = await tx.inventory.update({
            where: { id: inventory.id },
            data: { dp_price: dpPrice },
        });

        if (dpPrice !== null) {
            await tx.inventoryBatch.updateMany({
                where: { owner_id: user.ownerId, product_id: productId, source_type: "opening_stock" },
                data: { dp_price: dpPrice },
            });
        }

        // Sales made before this product had a purchase rate were stored with
        // cost_price 0 and counted no profit. Now that a rate exists, fill those
        // lines in so their profit appears in the dashboard and reports; lines
        // that already carry a cost keep it.
        if (dpPrice !== null && dpPrice > 0) {
            await tx.saleItem.updateMany({
                where: { owner_id: user.ownerId, product_id: productId, cost_price: 0 },
                data: { cost_price: dpPrice },
            });
        }

        return updated;
    });
};

export const InventoryService = {
    getAllInventory,
    getInventoryList,
    getInventoryHistory,
    getInventoryBatches,
    adjustInventory,
    setDpPrice,
};
