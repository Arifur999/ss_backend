import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ProfitWithdrawalService } from "./profitWithdrawal.service.js";

const getAllProfitWithdrawals = catchAsync(async (req: Request, res: Response) => {
    const result = await ProfitWithdrawalService.getAllProfitWithdrawals(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Profit withdrawals retrieved successfully",
        data: result,
    });
});

const createProfitWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await ProfitWithdrawalService.createProfitWithdrawal(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Profit withdrawal created successfully",
        data: result,
    });
});

const updateProfitWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await ProfitWithdrawalService.updateProfitWithdrawal(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Profit withdrawal updated successfully",
        data: result,
    });
});

const deleteProfitWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await ProfitWithdrawalService.deleteProfitWithdrawal(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Profit withdrawal deleted successfully",
        data: result,
    });
});

export const ProfitWithdrawalController = {
    getAllProfitWithdrawals,
    createProfitWithdrawal,
    updateProfitWithdrawal,
    deleteProfitWithdrawal,
};
