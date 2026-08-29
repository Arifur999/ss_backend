import { env } from "../../config/env.js";
import { IRequestUser } from "../interfaces/requestUser.interface.js";
import { jwtUtils } from "./jwt.js";
import { daysToMs, durationToSeconds, sessionExpAfter, timeLeftMs } from "./session.js";

// ---------------------------------------------------------------------------
// Session lifetime.
//
// One sign-in lasts SESSION_DAYS (15 by default) and then ends: the user lands
// back on the login form and a fresh emailed code is required. It used to be a
// day, which signed everybody out every morning.
//
// The window is ABSOLUTE, not sliding. `sessionExp` (unix seconds) is stamped
// into the refresh token when the session starts and copied unchanged through
// every rotation, so refreshing renews the access token but never the session.
//
// Neither token is allowed to outlive `sessionExp`: near the deadline they are
// minted with only the seconds that are left. Without that cap an access token
// handed out just before the end would keep working for its full lifetime
// afterwards.
// ---------------------------------------------------------------------------
export const SESSION_MAX_AGE_MS = daysToMs(env.SESSION_DAYS);

/** Unix seconds at which a session starting right now must end. */
export const newSessionExp = () => sessionExpAfter(SESSION_MAX_AGE_MS);

/** Milliseconds left in a session - never negative. */
export const sessionTimeLeftMs = (sessionExp: number) => timeLeftMs(sessionExp);

// jsonwebtoken rejects expiresIn <= 0, and a token with one second to live is
// as good as none - but issuing it is still better than throwing on a request
// that is about to be answered with a 401 anyway.
const secondsLeft = (sessionExp: number) =>
    Math.max(1, Math.ceil(sessionTimeLeftMs(sessionExp) / 1000));

const getAccessToken = (payload: IRequestUser, sessionExp: number) => {
    const configured = durationToSeconds(env.ACCESS_TOKEN_EXPIRES_IN, 86400);

    return jwtUtils.createToken(
        { ...payload },
        env.ACCESS_TOKEN_SECRET,
        { expiresIn: Math.min(configured, secondsLeft(sessionExp)) }
    );
};

const getRefreshToken = (payload: IRequestUser, sessionExp: number) => {
    return jwtUtils.createToken(
        // Carried by the refresh token alone: it is the one claim that decides
        // whether a session may continue, and getNewTokens copies it forward
        // untouched.
        { ...payload, sessionExp },
        env.REFRESH_TOKEN_SECRET,
        { expiresIn: secondsLeft(sessionExp) }
    );
};

export const tokenUtils = { getAccessToken, getRefreshToken };
