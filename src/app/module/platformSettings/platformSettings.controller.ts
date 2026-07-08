import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { PlatformSettingsService } from "./platformSettings.service.js";

const getPaymentInfo = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformSettingsService.getPaymentInfo();
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Payment info retrieved successfully",
        data: result,
    });
});

const getFullSettings = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformSettingsService.getFullSettings();
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform settings retrieved successfully",
        data: result,
    });
});

const updateSettings = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformSettingsService.updateSettings(req.body);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform settings saved successfully",
        data: result,
    });
});

const sendTestReminder = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformSettingsService.sendTestReminder(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: result.sent
            ? "Test email sent successfully"
            : "Email not configured - rendered preview returned instead",
        data: result,
    });
});

export const PlatformSettingsController = {
    getPaymentInfo,
    getFullSettings,
    updateSettings,
    sendTestReminder,
};
