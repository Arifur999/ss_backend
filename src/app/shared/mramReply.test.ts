import test from "node:test";
import assert from "node:assert/strict";
import { classifyMramReply, MRAM_ERROR_CODES } from "./mramReply.js";

// The case that started this: a shop with credit in its wallet AND taka in the
// MRAM account was told "Gateway balance insufficient" on an account that had
// worked for months. One way that happens without anything being wrong at the
// gateway is a reply the parser misreads, so the misreadings are pinned here.

const ok = (raw: string) => classifyMramReply({ raw, ok: true, status: 200 });

test("a bare code is the failure it names", () => {
    const verdict = ok("1007");
    assert.equal(verdict.success, false);
    assert.equal(verdict.error, "Gateway balance insufficient");
    assert.equal(verdict.code, "1007");
    assert.equal(verdict.shootId, "");
});

test("every documented code is recognised on its own", () => {
    for (const [code, message] of Object.entries(MRAM_ERROR_CODES)) {
        assert.deepEqual(ok(code), { success: false, error: message, shootId: "", code });
    }
});

test("a quoted code is still a code", () => {
    assert.equal(ok('"1004"').error, "SPAM detected");
});

test("a code with a few words after it is still a code", () => {
    assert.equal(ok("1007 - insufficient balance").error, "Gateway balance insufficient");
    assert.equal(ok('{"code":1012}').error, "Invalid number");
});

// The regression. The old rule searched the whole body for a 4-digit token in
// the code range, so an accepted batch could be reported as a balance failure
// while the SMS went out - the shop sees red, the customer gets the message,
// and the credits are refunded for a send that happened.
test("a long success payload carrying a code-shaped token is NOT a failure", () => {
    const verdict = ok('{"shoot_id":"SH-1007-A9","accepted":2,"at":"2026-09-22T10:02:00Z"}');
    assert.equal(verdict.success, true);
    assert.equal(verdict.error, "");
    assert.equal(verdict.shootId, '{"shoot_id":"SH-1007-A9","accepted":2,"at":"2026-09-22T10:02:00Z"}');
});

test("a long numeric shoot id is not mistaken for a code", () => {
    // No word boundary inside a run of digits, and far past MAX_CODED_REPLY
    // anyway - but it is the shape a shoot id most often takes, so it is
    // worth an assertion of its own.
    assert.equal(ok("20260922100712345").success, true);
});

test("a four-digit number outside the code table is a shoot id", () => {
    const verdict = ok("9432");
    assert.equal(verdict.success, true);
    assert.equal(verdict.shootId, "9432");
});

test("an unrecognised body on a 200 is an accepted batch, id kept", () => {
    assert.deepEqual(ok("SH99A2B"), { success: true, error: "", shootId: "SH99A2B", code: "" });
});

test("a failing status keeps the body, because nobody has seen this reply before", () => {
    const verdict = classifyMramReply({ raw: "upstream timeout", ok: false, status: 504 });
    assert.equal(verdict.success, false);
    assert.equal(verdict.error, "Gateway responded 504: upstream timeout");
});

test("a failing status with no body still says the status", () => {
    assert.equal(
        classifyMramReply({ raw: "", ok: false, status: 502 }).error,
        "Gateway responded 502"
    );
});

test("silence on a 200 is not success - there is no batch to point at", () => {
    const verdict = ok("   ");
    assert.equal(verdict.success, false);
    assert.equal(verdict.shootId, "");
});

// A coded body must beat the HTTP status: the code says what is wrong, and
// "Gateway responded 500" would throw that away.
test("a code wins over a failing status", () => {
    const verdict = classifyMramReply({ raw: "1002", ok: false, status: 500 });
    assert.equal(verdict.error, "Sender ID / masking not found");
    assert.equal(verdict.code, "1002");
});
