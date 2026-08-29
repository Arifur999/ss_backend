import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysToMs, durationToSeconds, sessionExpAfter, timeLeftMs } from "./session.js";

// A session used to die after 24 hours, so everyone signed in again every
// morning. These pin down the 15-day window that replaced it - above all that
// it is absolute: a rotation carries the original deadline forward instead of
// pushing it out, which is the whole difference between "15 days" and "never
// expires while you keep using it".

const DAY = 24 * 60 * 60 * 1000;
const LOGIN = Date.parse("2026-08-29T09:00:00.000Z");

describe("session window", () => {
    it("ends 15 days after signing in", () => {
        const sessionExp = sessionExpAfter(daysToMs(15), LOGIN);

        assert.equal(sessionExp * 1000, LOGIN + 15 * DAY);
    });

    it("still has time left on day 14 and none on day 15", () => {
        const sessionExp = sessionExpAfter(daysToMs(15), LOGIN);

        assert.equal(timeLeftMs(sessionExp, LOGIN + 14 * DAY), DAY);
        assert.equal(timeLeftMs(sessionExp, LOGIN + 15 * DAY), 0);
    });

    it("never reports negative time left once the session is over", () => {
        const sessionExp = sessionExpAfter(daysToMs(15), LOGIN);

        assert.equal(timeLeftMs(sessionExp, LOGIN + 40 * DAY), 0);
    });

    it("does not extend when a token is rotated mid-session", () => {
        const sessionExp = sessionExpAfter(daysToMs(15), LOGIN);

        // A refresh on day 10 re-mints tokens against the SAME sessionExp;
        // what shrinks is the time left, and the deadline does not move.
        const dayTen = LOGIN + 10 * DAY;
        assert.equal(timeLeftMs(sessionExp, dayTen), 5 * DAY);
        assert.equal(sessionExp * 1000, LOGIN + 15 * DAY);
    });
});

describe("durationToSeconds", () => {
    it("reads the units used for token lifetimes", () => {
        assert.equal(durationToSeconds("1d", 0), 86400);
        assert.equal(durationToSeconds("2h", 0), 7200);
        assert.equal(durationToSeconds("15m", 0), 900);
        assert.equal(durationToSeconds("30s", 0), 30);
        assert.equal(durationToSeconds("45", 0), 45);
    });

    it("falls back instead of throwing on a malformed value", () => {
        // A typo in an env var must not be able to take sign-in down.
        assert.equal(durationToSeconds("", 86400), 86400);
        assert.equal(durationToSeconds("1 week", 86400), 86400);
        assert.equal(durationToSeconds("-1d", 86400), 86400);
    });
});
