// Reading MRAM's answer to a send.
//
// The gateway does not use HTTP status codes to say what happened. It answers
// 200 with a body, and the body is either one of the numeric codes below or
// the SMS Shoot ID of an accepted batch. So everything hangs on telling those
// two apart from a string.
//
// This lives apart from mram.ts because mram.ts reaches config/env.ts for the
// API key, and a test that imports env fails in CI where there is no .env.
// Nothing here imports anything.

export const MRAM_ERROR_CODES: Record<string, string> = {
    "1002": "Sender ID / masking not found",
    "1003": "API not found",
    "1004": "SPAM detected",
    "1005": "Gateway internal error",
    "1006": "Gateway internal error",
    "1007": "Gateway balance insufficient",
    "1008": "Message is empty",
    "1009": "Message type not set",
    "1010": "Invalid user & password",
    "1011": "Invalid user id",
    "1012": "Invalid number",
    "1013": "API limit reached",
    "1014": "No matching template",
    "1015": "SMS content validation failed",
    "1016": "IP address not allowed",
    "1019": "SMS purpose missing",
};

/**
 * How long a body may be and still be read as a bare error code.
 *
 * The old rule searched the WHOLE body for a 4-digit token in the code range,
 * so any accepted batch whose Shoot ID happened to contain one - "1007" beside
 * a hyphen or a quote is a standalone token to a regex - was reported to the
 * shop as "Gateway balance insufficient" while the message went out normally.
 * A code, or a code with a few words of explanation after it, is short. A
 * success payload carrying an id, a timestamp and a count is not.
 */
const MAX_CODED_REPLY = 48;

export interface MramVerdict {
    success: boolean;
    /** Empty on success. */
    error: string;
    /** Empty unless the batch was accepted. */
    shootId: string;
    /** The gateway code this was read as, or "" if none was found. */
    code: string;
}

/**
 * What the gateway's reply means.
 *
 * `ok` is the HTTP-level result, which only decides the outcome when the body
 * itself says nothing recognisable: a 500 with an empty body is a failure, and
 * a 200 with an unrecognised body is an accepted batch whose id we keep.
 */
export const classifyMramReply = (input: { raw: string; ok: boolean; status: number }): MramVerdict => {
    // Some gateways quote the whole body. A quoted code is still a code.
    const body = String(input.raw || "").trim().replace(/^"(.*)"$/s, "$1").trim();

    const fail = (error: string, code = "") => ({ success: false, error, shootId: "", code });

    // The plain case the docs describe: the body IS the code.
    if (/^\d{4}$/.test(body) && MRAM_ERROR_CODES[body]) {
        return fail(MRAM_ERROR_CODES[body], body);
    }

    // A code wearing a little decoration - `1007 - insufficient balance`, or
    // `{"code":1007}`. Only in a short body, per MAX_CODED_REPLY.
    if (body.length <= MAX_CODED_REPLY) {
        const token = body.match(/(?<!\d)(\d{4})(?!\d)/g)?.find((found) => MRAM_ERROR_CODES[found]);
        if (token) return fail(MRAM_ERROR_CODES[token], token);
    }

    if (!input.ok) {
        // Worth keeping the body: this is the reply nobody has seen before, and
        // it is the only clue to what the gateway has started saying.
        return fail(body ? `Gateway responded ${input.status}: ${body.slice(0, 120)}` : `Gateway responded ${input.status}`);
    }

    if (!body) return fail("The gateway accepted nothing and said nothing");

    return { success: true, error: "", shootId: body, code: "" };
};
