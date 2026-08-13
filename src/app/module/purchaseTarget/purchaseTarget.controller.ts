import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { PurchaseTargetService } from "./purchaseTarget.service.js";

const getAllTargets = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseTargetService.getAllTargets(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Purchase targets retrieved successfully", data: result });
});

const createTarget = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseTargetService.createTarget(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "Purchase target created successfully", data: result });
});

const updateTarget = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseTargetService.updateTarget(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Purchase target updated successfully", data: result });
});

const deleteTarget = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseTargetService.deleteTarget(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: result.message, data: null });
});

export const PurchaseTargetController = {
    getAllTargets,
    createTarget,
    updateTarget,
    deleteTarget,
};
