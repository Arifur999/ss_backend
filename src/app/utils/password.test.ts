import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_PASSWORD_BYTES, passwordFits, passwordSchema } from "./password.js";

describe("the password rule", () => {
    const schema = passwordSchema();

    it("takes an ordinary password", () => {
        assert.equal(schema.safeParse("correct-horse").success, true);
    });

    it("turns away one that is too short", () => {
        const result = schema.safeParse("short7c");
        assert.equal(result.success, false);
        assert.match(result.error!.issues[0].message, /at least 8/);
    });

    it("turns away one bcrypt would quietly truncate", () => {
        // Proven behaviour, not a guess: a 92-character password authenticates
        // against a completely different tail, because bcrypt only ever hashed
        // the first 72 bytes. Accepting it would promise strength the stored
        // hash does not have.
        const tooLong = "A".repeat(MAX_PASSWORD_BYTES + 1);
        const result = schema.safeParse(tooLong);
        assert.equal(result.success, false);
        assert.match(result.error!.issues[0].message, /at most 72 bytes/);
    });

    it("accepts one that lands exactly on the limit", () => {
        assert.equal(schema.safeParse("A".repeat(MAX_PASSWORD_BYTES)).success, true);
    });

    it("counts bytes, not characters", () => {
        // Bangla is three bytes to the character, so 24 characters is the
        // ceiling there while 72 English characters is.
        const bangla24 = "অ".repeat(24);
        const bangla25 = "অ".repeat(25);
        assert.equal(passwordFits(bangla24), true);
        assert.equal(passwordFits(bangla25), false);
        assert.equal(schema.safeParse(bangla25).success, false);
    });

    it("lets a mixed-script password through on its byte count", () => {
        assert.equal(passwordFits("পাসওয়ার্ড-2026"), true);
    });
});
