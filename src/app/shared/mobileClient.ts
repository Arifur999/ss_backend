import type { Request } from "express";

// The mobile app cannot use the httpOnly cookie pair the website signs in with:
// React Native's cookie jar is shared, platform-specific and invisible to the
// app, so a sign-out in the app could leave a live session behind in it. The
// app keeps its tokens in the device keystore instead and sends them itself -
// the access token as `Authorization: Bearer`, which checkAuth already accepts,
// and the refresh token in the body of /auth/refresh-token.
//
// A request says it is the app with `X-Client: mobile`. That header is not in
// the CORS allow-list on purpose, so no other site's page can send it.
//
// The one rule that matters: in mobile mode the refresh token is read from the
// BODY ONLY, never from the cookie. Otherwise a script running on the website
// could post to /refresh-token with this header, and the server would read the
// httpOnly cookie and hand the fresh pair back in the response - turning
// httpOnly into nothing. Reading only the body means the caller must already
// hold the token it is asking to refresh.

export const MOBILE_CLIENT_HEADER = "x-client";

type HasHeaders = Pick<Request, "headers">;

export const isMobileClient = (req: HasHeaders): boolean => {
    const value = req.headers[MOBILE_CLIENT_HEADER];
    return typeof value === "string" && value.trim().toLowerCase() === "mobile";
};

/** The refresh token a mobile request carries in its body, if it is one. */
export const mobileRefreshToken = (req: HasHeaders & { body?: unknown }): string | undefined => {
    if (!isMobileClient(req)) return undefined;
    const body = req.body as { refreshToken?: unknown } | undefined;
    const token = body?.refreshToken;
    return typeof token === "string" && token.length > 0 ? token : undefined;
};

export interface MobileTokens {
    accessToken: string;
    refreshToken: string;
    /** What is left of the session; the app signs out when it runs out. */
    expiresInMs: number;
}

export const toMobileTokens = (result: {
    accessToken: string;
    refreshToken: string;
    sessionMaxAgeMs: number;
}): MobileTokens => ({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresInMs: Math.max(0, Math.floor(result.sessionMaxAgeMs)),
});
