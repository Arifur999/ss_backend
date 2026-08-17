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
