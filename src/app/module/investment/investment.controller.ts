import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { InvestmentService } from "./investment.service.js";

const getAllInvestments = catchAsync(async (req: Request, res: Response) => {
    const result = await InvestmentService.getAllInvestments(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Investments retrieved successfully",
        data: result,
    });
});

const createInvestment = catchAsync(async (req: Request, res: Response) => {
    const result = await InvestmentService.createInvestment(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Investment created successfully",
        data: result,
    });
});

const updateInvestment = catchAsync(async (req: Request, res: Response) => {
    const result = await InvestmentService.updateInvestment(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Investment updated successfully",
        data: result,
    });
});

const deleteInvestment = catchAsync(async (req: Request, res: Response) => {
    const result = await InvestmentService.deleteInvestment(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Investment deleted successfully",
        data: result,
    });
});

export const InvestmentController = {
    getAllInvestments,
    createInvestment,
    updateInvestment,
    deleteInvestment,
};
