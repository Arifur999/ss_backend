/**
 * Money, to the whole taka. 105.9 becomes 106, 105.4 becomes 105.
 *
 * The business does not deal in paisa, so nothing this server stores in a
 * Decimal(15,2) column should carry them. The frontend rounds what the operator
 * types; this is for the figures the server derives itself, and the FIFO unit
 * cost is the one that mattered: it is a total divided by a quantity, so three
 * cost layers of 100 + 101 + 101 over three units used to persist 100.67.
 *
 * Math.round on its own breaks ties towards +Infinity, so 105.5 came out 106
 * while -105.5 came out -105. Rounding the magnitude and putting the sign back
 * keeps a figure and its negative the same distance from zero.
 *
 * `|| 0` is not redundant - it turns -0 back into 0.
 */
export const roundTaka = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return (numeric < 0 ? -Math.round(-numeric) : Math.round(numeric)) || 0;
};

/**
 * A DP after its percentage discount, to the whole taka.
 *
 * The product row stores the list DP and the discount separately, so the list
 * can print "Tk 11,400 -10%". Everything that records what the goods actually
 * cost - an opening-stock batch, a sale line's cost - has to use this instead
 * of the raw DP, or profit is computed against a price nobody paid.
 *
 * Subtracts rather than multiplying by (1 - pct/100), and rounds once at the
 * end: the same rule as the frontend's actualDp in lib/purchaseAmounts.ts, so
 * both sides of the wire agree to the taka.
 */
export const actualDp = (dpPrice: unknown, discountPct: unknown): number => {
    const dp = roundTaka(dpPrice);
    const pct = Number(discountPct) || 0;
    return roundTaka(dp - (dp * pct) / 100);
};
