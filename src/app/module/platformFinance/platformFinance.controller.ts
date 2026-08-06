import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { DateRange, PlatformFinanceService } from "./platformFinance.service.js";

const rangeOf = (req: Request): DateRange => ({
    from: typeof req.query.from === "string" && req.query.from ? req.query.from : undefined,
    to: typeof req.query.to === "string" && req.query.to ? req.query.to : undefined,
});

const getExpenses = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.getExpenses(rangeOf(req));
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform expenses retrieved successfully",
        data: result,
    });
});

const createExpense = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.createExpense(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Platform expense created successfully",
        data: result,
    });
});

const updateExpense = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.updateExpense(req.params.id as string, req.body);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform expense updated successfully",
        data: result,
    });
});

const deleteExpense = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.deleteExpense(req.params.id as string);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform expense deleted successfully",
        data: result,
    });
});

const getWithdrawals = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.getWithdrawals(rangeOf(req));
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform withdrawals retrieved successfully",
        data: result,
    });
});

const createWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.createWithdrawal(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Platform withdrawal created successfully",
        data: result,
    });
});

const updateWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.updateWithdrawal(req.params.id as string, req.body);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform withdrawal updated successfully",
        data: result,
    });
});

const deleteWithdrawal = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.deleteWithdrawal(req.params.id as string);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform withdrawal deleted successfully",
        data: result,
    });
});

const getSummary = catchAsync(async (req: Request, res: Response) => {
    const result = await PlatformFinanceService.getSummary(rangeOf(req));
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Platform finance summary retrieved successfully",
        data: result,
    });
});

export const PlatformFinanceController = {
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getWithdrawals,
    createWithdrawal,
    updateWithdrawal,
    deleteWithdrawal,
    getSummary,
};
