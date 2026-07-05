import { Request, Response } from "express";
import { env } from "../../config/env.js";

const isProduction = env.NODE_ENV === "production";

const baseOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
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
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
};

const clearAuthCookies = (res: Response) => {
    res.clearCookie("accessToken", baseOptions);
    res.clearCookie("refreshToken", baseOptions);
};

export const cookieUtils = { getCookie, setAuthCookies, clearAuthCookies };
