import { Request, Response } from "express";
import { env } from "../../config/env.js";
import { SESSION_MAX_AGE_MS } from "./token.js";

const isProduction = env.NODE_ENV === "production";

// SameSite=lax is safe now that nginx serves the SPA and the API from one
// origin: same-site requests carry the cookie regardless, and refusing to send
// it from anyone else's page is what stops a cross-site request from acting as
// the signed-in user. The old "none" was only needed back when the frontend
// and the API lived on separate domains.
const baseOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
};

const getCookie = (req: Request, name: string): string | undefined => {
    return req.cookies?.[name];
};

/**
 * Writes the auth cookie pair.
 *
 * `maxAgeMs` is what is LEFT of the session, so on a refresh late in the
 * window the cookies expire with it rather than a full window later. It used
 * to be hardcoded to 24 hours here, which is what actually signed everyone out
 * daily: the refresh token was still valid, but the browser had already thrown
 * the cookie carrying it away, so there was nothing left to refresh with.
 *
 * The cookies only decide how long the browser keeps them. Whether a request
 * is authorised is still the JWT's call, checked on every request.
 */
const setAuthCookies = (
    res: Response,
    accessToken: string,
    refreshToken: string,
    maxAgeMs: number = SESSION_MAX_AGE_MS,
) => {
    const maxAge = Math.max(1000, Math.floor(maxAgeMs));

    res.cookie("accessToken", accessToken, { ...baseOptions, maxAge });
    res.cookie("refreshToken", refreshToken, { ...baseOptions, maxAge });
};

const clearAuthCookies = (res: Response) => {
    res.clearCookie("accessToken", baseOptions);
    res.clearCookie("refreshToken", baseOptions);
};

export const cookieUtils = { getCookie, setAuthCookies, clearAuthCookies };
