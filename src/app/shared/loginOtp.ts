// Whether a sign-in may skip the emailed code.
//
// The code is the second factor on every login, and stays so. Two narrow
// exceptions, both switched on only on the server, never by a request:
//
// - LOGIN_OTP_ENABLED=false turns the code off for everyone - the break-glass
//   for a mail provider that is down, which would otherwise lock every account
//   out.
// - REVIEW_LOGIN_EMAILS names accounts that sign in with their password alone.
//   It exists for the app stores' reviewers, who are handed a login and have
//   no way to read the code mailed to it. Keep it to a demo workspace holding
//   no real business, and empty it once the review is done.
//
// Either way the account must already have confirmed its email: an
// unconfirmed one still goes through the code, which is what confirms it.

/** The review accounts, from the comma-separated REVIEW_LOGIN_EMAILS: trimmed, lower-cased, blanks dropped. */
export function parseReviewEmails(raw: string | undefined): string[] {
    return String(raw || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

export function skipsLoginOtp(input: { otpEnabled: boolean; reviewEmails: string[]; email: string; emailVerified: boolean }): boolean {
    if (!input.emailVerified) return false;
    if (!input.otpEnabled) return true;
    return input.reviewEmails.includes(input.email.trim().toLowerCase());
}
