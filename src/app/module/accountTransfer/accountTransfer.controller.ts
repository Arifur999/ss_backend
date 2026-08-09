import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { parseListOptions } from "../../shared/listQuery.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AccountTransferService } from "./accountTransfer.service.js";

const getAllTransfers = catchAsync(async (req: Request, res: Response) => {
    const result = await AccountTransferService.getAllTransfers(req.user as IRequestUser, parseListOptions(req.query as Record<string, unknown>));
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Transfers retrieved successfully",
        data: result,
    });
});

const createTransfer = catchAsync(async (req: Request, res: Response) => {
    const result = await AccountTransferService.createTransfer(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Transfer created successfully",
        data: result,
    });
});

const updateTransfer = catchAsync(async (req: Request, res: Response) => {
    const result = await AccountTransferService.updateTransfer(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Transfer updated successfully",
        data: result,
    });
});

const deleteTransfer = catchAsync(async (req: Request, res: Response) => {
    const result = await AccountTransferService.deleteTransfer(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Transfer deleted successfully",
        data: result,
    });
});

export const AccountTransferController = {
    getAllTransfers,
    createTransfer,
    updateTransfer,
    deleteTransfer,
};
