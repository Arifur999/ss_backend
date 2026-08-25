import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { TYPING_TTL_MS, clearTyping, isTyping, markTyping, resetTyping } from "./typingRegistry.js";

describe("who is typing", () => {
    beforeEach(() => resetTyping());

    it("shows somebody who just typed", () => {
        markTyping("t1", "admin", 1000);
        assert.equal(isTyping("t1", "admin", 1000), true);
    });

    it("stops showing them once they have gone quiet", () => {
        markTyping("t1", "admin", 1000);
        assert.equal(isTyping("t1", "admin", 1000 + TYPING_TTL_MS - 1), true);
        assert.equal(isTyping("t1", "admin", 1000 + TYPING_TTL_MS), false);
    });

    it("keeps the two sides apart", () => {
        markTyping("t1", "customer", 1000);
        assert.equal(isTyping("t1", "customer", 1000), true);
        assert.equal(isTyping("t1", "admin", 1000), false);
    });

    it("keeps tickets apart", () => {
        markTyping("t1", "admin", 1000);
        assert.equal(isTyping("t2", "admin", 1000), false);
    });

    it("says nobody is typing on a ticket never written to", () => {
        assert.equal(isTyping("never-seen", "admin", 1000), false);
    });

    it("forgets somebody the moment they send", () => {
        // Otherwise the bubble hangs under the message that was just typed,
        // reading as a second one on the way.
        markTyping("t1", "customer", 1000);
        clearTyping("t1", "customer");
        assert.equal(isTyping("t1", "customer", 1000), false);
    });

    it("leaves the other side alone when one of them sends", () => {
        markTyping("t1", "customer", 1000);
        markTyping("t1", "admin", 1000);
        clearTyping("t1", "customer");
        assert.equal(isTyping("t1", "admin", 1000), true);
    });

    it("does not grow without bound", () => {
        // A minute after anyone last typed, the entry goes; the next write is
        // what sweeps it, so no timer has to run.
        markTyping("old", "admin", 0);
        markTyping("new", "admin", 120_000);
        assert.equal(isTyping("old", "admin", 120_000), false);
    });
});
