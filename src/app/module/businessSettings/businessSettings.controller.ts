import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { BusinessSettingsService } from "./businessSettings.service.js";

const getBusinessSettings = catchAsync(async (req: Request, res: Response) => {
    const result = await BusinessSettingsService.getBusinessSettings(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Business settings retrieved successfully",
        data: result,
    });
});

const upsertBusinessSettings = catchAsync(async (req: Request, res: Response) => {
    const result = await BusinessSettingsService.upsertBusinessSettings(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Business settings saved successfully",
        data: result,
    });
});

export const BusinessSettingsController = {
    getBusinessSettings,
    upsertBusinessSettings,
};
