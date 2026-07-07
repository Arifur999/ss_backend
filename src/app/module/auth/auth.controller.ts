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
    // Registration never sets cookies any more: the account exists but stays
    // locked until the emailed OTP is verified (see verifyOtp below).
    const result = await AuthService.registerOwner(req.body);

    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Verification code sent to your email",
        data: result, // { needsEmailConfirmation: true, email }
    });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.loginUser(req.body);

    // Unverified account: correct password, but the email OTP was never
    // confirmed. A fresh code has been sent - no cookies are issued yet.
    if ("needsEmailConfirmation" in result) {
        sendResponse(res, {
            success: true,
            httpStatus: status.OK,
            message: "Please verify your email - a new code has been sent",
            data: result, // { needsEmailConfirmation: true, email }
        });
        return;
    }

    // Fully verified account: issue the httpOnly auth cookie pair.
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

// Final step of registration / unverified login: the submitted OTP is checked
// and, on success, the account is marked verified and logged in (cookies set).
const verifyOtp = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.verifyEmailOtp(req.body.email, req.body.otp);

    cookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Email verified successfully",
        data: {
            user: result.user,
            profile: result.profile,
            subscription: result.subscription,
        },
    });
});

// "Didn't get the code?" button - rate limited to once per 60 seconds.
const resendOtp = catchAsync(async (req: Request, res: Response) => {
    const result = await AuthService.resendVerificationOtp(req.body.email);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "A new verification code has been sent",
        data: result,
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
        // Cookie hygiene: a dead/tampered refresh token is useless - clear
        // both cookies so the browser stops retrying with garbage and the
        // frontend lands cleanly on the login page.
        cookieUtils.clearAuthCookies(res);
        throw new AppError(status.UNAUTHORIZED, "Invalid refresh token");
    }

    const result = await AuthService.getNewTokens(verified.decoded as unknown as IRequestUser);

    // Token rotation: every refresh issues a brand-new access+refresh pair.
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
    verifyOtp,
    resendOtp,
    getMe,
    refreshToken,
    logoutUser,
    touchActivity,
};
