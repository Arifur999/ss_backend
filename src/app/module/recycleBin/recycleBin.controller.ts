import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { RecycleBinService } from "./recycleBin.service.js";

const getRecycleItems = catchAsync(async (req: Request, res: Response) => {
    const result = await RecycleBinService.getRecycleItems(
        req.user as IRequestUser,
        req.query.type as string | undefined
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Recycle bin items retrieved successfully",
        data: result,
    });
});

const restoreItem = catchAsync(async (req: Request, res: Response) => {
    const result = await RecycleBinService.restoreItem(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Item restored successfully",
        data: result,
    });
});

const deleteItemPermanently = catchAsync(async (req: Request, res: Response) => {
    const result = await RecycleBinService.deleteItemPermanently(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Item permanently deleted",
        data: result,
    });
});

const emptyRecycleBin = catchAsync(async (req: Request, res: Response) => {
    const result = await RecycleBinService.emptyRecycleBin(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Recycle bin emptied",
        data: result,
    });
});

export const RecycleBinController = {
    getRecycleItems,
    restoreItem,
    deleteItemPermanently,
    emptyRecycleBin,
};
