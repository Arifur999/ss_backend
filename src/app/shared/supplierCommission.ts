// ---------------------------------------------------------------------------
// What a supplier owes you for meeting a purchase target.
//
// A target is an agreement: buy this much from me in this month and I will pay
// you that. Until now the app held only the first half - how much had been
// bought - so the second half lived in somebody's memory and was typed in by
// hand when the money arrived.
//
// Pure on purpose, like every other money rule here: no Prisma, no env, so it
// can be tested in CI where there is no .env file.
// ---------------------------------------------------------------------------

export type CommissionRuleValue = "none" | "percent" | "fixed";

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export interface TargetTerms {
    /** What has to be bought in the month for the commission to be earned. */
    target: number;
    rule: CommissionRuleValue | string | null | undefined;
    /** Per cent for a percent rule, taka for a fixed one. */
    value: number;
}

/**
 * What the target is worth when it is met.
 *
 * A percent rule takes its per cent OF THE TARGET, not of what has actually
 * been bought so far. That is the whole reason the figure can be shown before
 * the target is reached - "buy 40,000 more to earn 12,000" is only sayable
 * because the 12,000 does not move while you buy. A commission off the running
 * total would creep upward with every bill and could never be promised.
 *
 * Nothing is earned by a target of zero: a goal nobody has to reach is not an
 * agreement, and paying out on it would turn every blank target into money.
 */
export function commissionValue(terms: TargetTerms): number {
    const target = round(terms.target);
    if (target <= 0) return 0;

    const value = round(terms.value);
    if (value <= 0) return 0;

    if (terms.rule === "percent") return round((target * value) / 100);
    if (terms.rule === "fixed") return value;
    return 0;
}

export interface TargetProgress {
    /** The month's goal. */
    target: number;
    /** Bought against it: bills plus whatever already counts toward the target. */
    bought: number;
    /** What meeting it is worth. */
    commission: number;
    /** Whether it has been met. */
    met: boolean;
    /** What is still to buy. Zero once the target is met. */
    remaining: number;
    /**
     * How far along, 0-100 and clamped there.
     *
     * Clamped because a progress bar past its own end reads as a rendering
     * fault rather than as good news, and the figure beside it already says
     * how far over the target the buying went.
     */
    percent: number;
}

/**
 * Where a supplier stands against this month's target.
 *
 * `bought` is what counts toward it. The design is explicit that commission
 * credited back by the supplier counts as well as cash paid - "it counts
 * toward the target and you can buy goods with it" - so the caller adds the
 * two before passing them here rather than this module guessing which is which.
 */
export function targetProgress(terms: TargetTerms, bought: number): TargetProgress {
    const target = round(terms.target);
    const done = round(bought);
    const commission = commissionValue(terms);
    const met = target > 0 && done >= target;

    return {
        target,
        bought: done,
        commission,
        met,
        remaining: target > 0 ? Math.max(0, round(target - done)) : 0,
        percent: target > 0 ? Math.min(100, Math.max(0, Math.round((done / target) * 100))) : 0,
    };
}

/**
 * How many months a target's period covers, both ends included.
 *
 * A target is agreed as a monthly figure over a run of months, so the row that
 * stores one start and one end has to be read back a month at a time. Returns
 * at least 1: a period that ends before it starts is a typo, not a request for
 * a negative number of months, and the validation refuses it at the edge.
 */
export function monthsInPeriod(period: {
    start_year: number; start_month: number; end_year: number; end_month: number;
}): number {
    const start = period.start_year * 12 + period.start_month;
    const end = period.end_year * 12 + period.end_month;
    return Math.max(1, end - start + 1);
}

/** Whether a given year-month falls inside a target's period. */
export function coversMonth(
    period: { start_year: number; start_month: number; end_year: number; end_month: number },
    year: number,
    month: number,
): boolean {
    const at = year * 12 + month;
    return at >= period.start_year * 12 + period.start_month && at <= period.end_year * 12 + period.end_month;
}
