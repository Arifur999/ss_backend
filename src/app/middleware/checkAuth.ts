import { NextFunction, Request, Response } from "express";
import status from "http-status";
import { env } from "../../config/env.js";
import { Role } from "../../generated/prisma/enums.js";
import AppError from "../errorHelpers/AppError.js";
import { prisma } from "../lib/prisma.js";
import { cookieUtils } from "../utils/cookie.js";
import { jwtUtils } from "../utils/jwt.js";

export const checkAuth = (...authRoles: Role[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken =
            cookieUtils.getCookie(req, "accessToken") ||
            (req.headers.authorization?.startsWith("Bearer ")
                ? req.headers.authorization.slice(7)
                : undefined);

        if (!accessToken) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access! No access token provided.");
        }

        const verifiedToken = jwtUtils.verifyToken(accessToken, env.ACCESS_TOKEN_SECRET);

        if (!verifiedToken.success) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access! Invalid access token.");
        }

        const { userId } = verifiedToken.decoded;

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access! User not found.");
        }

        if (!user.is_active) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access! User is not active.");
        }

        // Defense in depth: cookies are only issued after OTP verification,
        // but if a token somehow exists for an unverified account (e.g. the
        // account was un-verified by an admin), block it here too.
        if (!user.email_verified && user.role !== Role.super_admin) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access! Email is not verified.");
        }

        if (authRoles.length > 0 && !authRoles.includes(user.role)) {
            throw new AppError(status.FORBIDDEN, "Forbidden access! You do not have permission to access this resource.");
        }

        req.user = {
            userId: user.id,
            ownerId: user.role === Role.super_admin ? user.id : (user.owner_id ?? user.id),
            role: user.role,
            email: user.email,
            name: user.full_name,
        };

        next();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        next(error);
    }
};
