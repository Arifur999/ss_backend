// ---------------------------------------------------------------------------
// Session window arithmetic.
//
// Kept free of any config import on purpose: the numbers come in as arguments,
// so this file (and its test) run without a .env - which CI does not have.
// tokenUtils is where these are wired to env.SESSION_DAYS.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const daysToMs = (days: number) => days * MS_PER_DAY;

/**
 * Unix seconds at which a session starting now must end.
 *
 * Seconds, not milliseconds, because this rides inside a JWT next to `exp`
 * and `iat`, which are both in seconds.
 */
export const sessionExpAfter = (maxAgeMs: number, now = Date.now()) =>
    Math.floor((now + maxAgeMs) / 1000);

/** Milliseconds left before `sessionExp` - never negative. */
export const timeLeftMs = (sessionExp: number, now = Date.now()) =>
    Math.max(0, sessionExp * 1000 - now);

/**
 * "15m" / "2h" / "1d" / plain seconds -> seconds.
 *
 * Covers the subset of jsonwebtoken's `expiresIn` syntax this project uses.
 * Needed because a configured token lifetime has to be compared against the
 * time left in the session, and that comparison cannot be done on a string.
 * Anything unparseable falls back rather than throwing: a typo in an env var
 * must not take sign-in down.
 */
export const durationToSeconds = (value: string, fallback: number): number => {
    const match = /^(\d+)\s*([smhd])?$/.exec(String(value).trim());
    if (!match) return fallback;

    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? "s"] ?? 1;

    return Number(match[1]) * multiplier;
};
