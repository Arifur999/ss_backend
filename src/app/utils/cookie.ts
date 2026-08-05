import { Request, Response } from "express";
import { env } from "../../config/env.js";

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

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
    res.cookie("accessToken", accessToken, {
        ...baseOptions,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
    });
    res.cookie("refreshToken", refreshToken, {
        ...baseOptions,
        // Matches the refresh token's own 1-day lifetime, so the session ends
        // a day after sign-in and a fresh emailed code is required.
        maxAge: 24 * 60 * 60 * 1000, // 1 day
    });
};

const clearAuthCookies = (res: Response) => {
    res.clearCookie("accessToken", baseOptions);
    res.clearCookie("refreshToken", baseOptions);
};

export const cookieUtils = { getCookie, setAuthCookies, clearAuthCookies };
