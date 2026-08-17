import rateLimit, { type Options } from "express-rate-limit";
import status from "http-status";

// Throttles for the unauthenticated auth endpoints.
//
// Why this exists: the OTP is six digits and a wrong guess only burns one of
// five attempts before the row is dropped - but nothing stopped a caller from
// simply asking for a fresh code and guessing five more. Unthrottled, that is
// an unattended path to any account whose email address is known. The same
// applies to password guessing on /login, where each attempt also costs a
// bcrypt comparison and is therefore a cheap way to load the server.
//
// The limits are set well above what a real person does. A customer signing in
// types one password, occasionally two or three; a limit of ten in fifteen
// minutes never reaches them, while an attacker needing thousands of tries is
// stopped immediately.
//
// Keyed by IP. That is the honest limitation: an attacker with many addresses
// spreads the load, and everyone behind one office NAT shares a bucket - which
// is why the ceilings are generous rather than tight. It raises the cost a great
// deal without a store to maintain; per-account lockout would be the next step
// if abuse is ever actually seen.

const sharedOptions: Partial<Options> = {
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // The proxy sets X-Forwarded-For; app.ts enables trust proxy so the client
    // address is the real one rather than nginx's.
    message: {
        success: false,
        message: "Too many attempts. Please wait a few minutes and try again.",
    },
    statusCode: status.TOO_MANY_REQUESTS,
};

// Password and code guessing: the two that lead to a compromised account.
export const authAttemptLimiter = rateLimit({
    ...sharedOptions,
    windowMs: 15 * 60 * 1000,
    limit: 10,
});

// Anything that sends an email. Lower, because each call costs a message from
// the mail quota and lands in somebody's inbox whether they asked for it or not.
export const authEmailLimiter = rateLimit({
    ...sharedOptions,
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: {
        success: false,
        message: "Too many requests for a code. Please wait a few minutes and try again.",
    },
});

// Registration, so one address cannot open accounts in a loop.
export const registerLimiter = rateLimit({
    ...sharedOptions,
    windowMs: 60 * 60 * 1000,
    limit: 10,
});

/**
 * The unauthenticated routes that are not guessing at anything: refresh-token
 * and logout.
 *
 * Neither can compromise an account, so the ceiling is much higher than the
 * guessing limiters - but /refresh-token was the cheapest unauthenticated
 * DB-touching endpoint on the box (a JWT verify, a user lookup and two cookie
 * writes per call), and it had no limit at all. This is about load, not
 * credentials.
 *
 * 60 in fifteen minutes is far above real use: a session refreshes on a timer
 * measured in minutes, and a tab left open all day does not approach it.
 */
export const sessionLimiter = rateLimit({
    ...sharedOptions,
    windowMs: 15 * 60 * 1000,
    limit: 60,
});

/**
 * Image upload. Authenticated, but every call costs Cloudinary quota, so a
 * compromised or careless staff account should not be able to run through it.
 * Keyed by IP like the rest; twenty images in fifteen minutes is more than any
 * real product-photo session.
 */
export const uploadLimiter = rateLimit({
    ...sharedOptions,
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: {
        success: false,
        message: "Too many uploads. Please wait a few minutes and try again.",
    },
});
