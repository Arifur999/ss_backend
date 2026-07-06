import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { OtherIncomeService } from "./otherIncome.service.js";

const getAllOtherIncomes = catchAsync(async (req: Request, res: Response) => {
    const result = await OtherIncomeService.getAllOtherIncomes(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Other incomes retrieved successfully",
        data: result,
    });
});

const createOtherIncome = catchAsync(async (req: Request, res: Response) => {
    const result = await OtherIncomeService.createOtherIncome(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Other income created successfully",
        data: result,
    });
});

const updateOtherIncome = catchAsync(async (req: Request, res: Response) => {
    const result = await OtherIncomeService.updateOtherIncome(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Other income updated successfully",
        data: result,
    });
});

const deleteOtherIncome = catchAsync(async (req: Request, res: Response) => {
    const result = await OtherIncomeService.deleteOtherIncome(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Other income deleted successfully",
        data: result,
    });
});

export const OtherIncomeController = {
    getAllOtherIncomes,
    createOtherIncome,
    updateOtherIncome,
    deleteOtherIncome,
};
