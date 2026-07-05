import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { MonthlyTargetService } from "./monthlyTarget.service.js";

const getAllTargets = catchAsync(async (req: Request, res: Response) => {
    const result = await MonthlyTargetService.getAllTargets(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Monthly targets retrieved successfully",
        data: result,
    });
});

const upsertTarget = catchAsync(async (req: Request, res: Response) => {
    const result = await MonthlyTargetService.upsertTarget(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Monthly target saved successfully",
        data: result,
    });
});

const deleteTarget = catchAsync(async (req: Request, res: Response) => {
    const result = await MonthlyTargetService.deleteTarget(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Monthly target deleted successfully",
        data: result,
    });
});

export const MonthlyTargetController = {
    getAllTargets,
    upsertTarget,
    deleteTarget,
};
