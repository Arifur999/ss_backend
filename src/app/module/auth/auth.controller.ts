import { Request, Response } from "express";
import status from "http-status";
import { env } from "../../../config/env.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { cookieUtils } from "../../utils/cookie.js";
import { jwtUtils } from "../../utils/jwt.js";
import { AuthService } from "./auth.service.js";

const registerOwner = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.registerOwner(req.body);

    cookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Owner registered successfully",
        data: {
            user: result.user,
            profile: result.profile,
            subscription: result.subscription,
        },
    });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.loginUser(req.body);

    cookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Logged in successfully",
        data: {
            user: result.user,
            profile: result.profile,
            subscription: result.subscription,
        },
    });
});

const getMe = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.getMe(req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Account retrieved successfully",
        data: result,
    });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
    const token = cookieUtils.getCookie(req, "refreshToken");

    if (!token) {
        throw new AppError(status.UNAUTHORIZED, "No refresh token provided");
    }

    const verified = jwtUtils.verifyToken(token, env.REFRESH_TOKEN_SECRET);

    if (!verified.success) {
        throw new AppError(status.UNAUTHORIZED, "Invalid refresh token");
    }

    const result = await AuthService.getNewTokens(verified.decoded as unknown as IRequestUser);

    cookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Tokens refreshed successfully",
        data: { refreshed: true },
    });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
    cookieUtils.clearAuthCookies(res);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Logged out successfully",
        data: { loggedOut: true },
    });
});

const touchActivity = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.touchOwnerActivity(req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Activity recorded",
        data: result,
    });
});

export const AuthController = {
    registerOwner,
    loginUser,
    getMe,
    refreshToken,
    logoutUser,
    touchActivity,
};
