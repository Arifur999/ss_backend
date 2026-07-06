import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { InventoryService } from "./inventory.service.js";

const getAllInventory = catchAsync(async (req: Request, res: Response) => {
    const result = await InventoryService.getAllInventory(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Inventory retrieved successfully",
        data: result,
    });
});

const getInventoryHistory = catchAsync(async (req: Request, res: Response) => {
    const result = await InventoryService.getInventoryHistory(
        req.user as IRequestUser,
        req.query.product_id as string | undefined
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Inventory history retrieved successfully",
        data: result,
    });
});

const getInventoryBatches = catchAsync(async (req: Request, res: Response) => {
    const result = await InventoryService.getInventoryBatches(
        req.user as IRequestUser,
        req.query.product_id as string | undefined
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Inventory batches retrieved successfully",
        data: result,
    });
});

const adjustInventory = catchAsync(async (req: Request, res: Response) => {
    const result = await InventoryService.adjustInventory(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Inventory adjusted successfully",
        data: result,
    });
});

export const InventoryController = {
    getAllInventory,
    getInventoryHistory,
    getInventoryBatches,
    adjustInventory,
};
