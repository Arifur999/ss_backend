import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ShareholderService } from "./shareholder.service.js";

const getAllShareholders = catchAsync(async (req: Request, res: Response) => {
    const result = await ShareholderService.getAllShareholders(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Shareholders retrieved successfully",
        data: result,
    });
});

const createShareholder = catchAsync(async (req: Request, res: Response) => {
    const result = await ShareholderService.createShareholder(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Shareholder created successfully",
        data: result,
    });
});

const updateShareholder = catchAsync(async (req: Request, res: Response) => {
    const result = await ShareholderService.updateShareholder(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Shareholder updated successfully",
        data: result,
    });
});

const deleteShareholder = catchAsync(async (req: Request, res: Response) => {
    const result = await ShareholderService.deleteShareholder(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Shareholder deleted successfully",
        data: result,
    });
});

export const ShareholderController = {
    getAllShareholders,
    createShareholder,
    updateShareholder,
    deleteShareholder,
};
