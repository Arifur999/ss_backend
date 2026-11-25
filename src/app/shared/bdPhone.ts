// ---------------------------------------------------------------------------
// Bangladeshi mobile numbers.
//
// Registration asked for "at least 6 characters", which is what a length check
// looks like when nobody has decided what a phone number is. Ten digits got in,
// and a workspace whose owner cannot be telephoned is one nobody can support,
// chase for a renewal, or verify as real.
//
// A number here is eleven digits beginning 01. People type it with spaces, with
// dashes, and with +880 in front, so all three are accepted and stripped rather
// than rejected - the shape is the rule, not the punctuation.
// ---------------------------------------------------------------------------

export const BD_PHONE_DIGITS = 11;

/**
 * The number as it should be stored: 01XXXXXXXXX, nothing else.
 *
 * Returns "" for anything that is not a Bangladeshi mobile number, so a caller
 * that forgets to validate stores nothing rather than storing rubbish.
 */
export function normalizeBdPhone(value: unknown): string {
    if (typeof value !== "string") return "";

    // Punctuation is forgiven; prose is not. Stripping every non-digit on its
    // own would read "call 01712345678 after six" as a phone number, and the
    // field would then accept a sentence as if it were one.
    const trimmed = value.trim();
    if (!/^\+?[\d\s().-]+$/.test(trimmed)) return "";

    let digits = trimmed.replace(/\D/g, "");

    // +8801712345678 and 8801712345678 are the same number written longhand.
    if (digits.length === 13 && digits.startsWith("880")) digits = digits.slice(2);
    // 8801712345678 without the leading zero: 1712345678 prefixed by 88.
    else if (digits.length === 12 && digits.startsWith("88")) digits = digits.slice(2);
    // 1712345678 - the leading zero dropped, as a spreadsheet does.
    else if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;

    return isBdMobile(digits) ? digits : "";
}

/** Whether these digits are an eleven-digit Bangladeshi mobile number. */
export function isBdMobile(digits: string): boolean {
    return /^01\d{9}$/.test(digits);
}

/** Whether what somebody typed can be read as one. */
export function looksLikeBdPhone(value: unknown): boolean {
    return normalizeBdPhone(value) !== "";
}

export const BD_PHONE_MESSAGE = "Phone number must be 11 digits and start with 01 (for example 01712345678)";
