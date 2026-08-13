/**
 * The rule that decides what a price file actually changes.
 *
 * Its own file, with no imports, on purpose. It is the whole safety story of
 * the bulk price update and deserves tests - but reaching it through
 * product.service pulls in the Prisma client, which reads the environment at
 * import time and throws where there is no .env. That is exactly what CI is,
 * so a test that imported the service passed on a developer's machine and
 * failed the moment it ran anywhere else.
 */

export const PRICE_FIELDS = ["cost_price", "selling_price", "dp_discount", "mrp_discount"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

/**
 * Which of a product's prices this row actually changes. Two rules:
 *
 *  - an absent field means the cell was blank, which means "leave this price
 *    alone" - never "set it to zero";
 *  - a field equal to what is already stored is not a change, so a file that
 *    repeats last month's prices reports "already correct" instead of claiming
 *    hundreds of updates.
 */
export const planPriceChange = (
    current: Record<PriceField, number>,
    row: Partial<Record<PriceField, number>>,
) => {
    const data: Partial<Record<PriceField, number>> = {};
    const before: Partial<Record<PriceField, number>> = {};
    const after: Record<PriceField, number> = { ...current };

    for (const field of PRICE_FIELDS) {
        const next = row[field];
        if (next === undefined || next === current[field]) continue;
        data[field] = next;
        before[field] = current[field];
        after[field] = next;
    }

    return { data, before, after, changed: Object.keys(data).length > 0 };
};
