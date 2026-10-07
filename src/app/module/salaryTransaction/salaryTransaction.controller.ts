import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { isMobileClient } from "../../shared/mobileClient.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SalaryTransactionService } from "./salaryTransaction.service.js";

const getAllSalaryTransactions = catchAsync(async (req: Request, res: Response) => {
    const result = await SalaryTransactionService.getAllSalaryTransactions(
        req.user as IRequestUser,
        req.query.employee_id as string | undefined
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Salary transactions retrieved successfully",
        data: result,
    });
});

const createSalaryTransaction = catchAsync(async (req: Request, res: Response) => {
    // The app has the server book the payment's expense; the website books it itself.
    const result = await SalaryTransactionService.createSalaryTransaction(req.body, req.user as IRequestUser, {
        bookExpense: isMobileClient(req),
    });
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Salary transaction created successfully",
        data: result,
    });
});

const updateSalaryTransaction = catchAsync(async (req: Request, res: Response) => {
    const result = await SalaryTransactionService.updateSalaryTransaction(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Salary transaction updated successfully",
        data: result,
    });
});

const deleteSalaryTransaction = catchAsync(async (req: Request, res: Response) => {
    const result = await SalaryTransactionService.deleteSalaryTransaction(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle,
        { withExpense: isMobileClient(req) }
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Salary transaction deleted successfully",
        data: result,
    });
});

export const SalaryTransactionController = {
    getAllSalaryTransactions,
    createSalaryTransaction,
    updateSalaryTransaction,
    deleteSalaryTransaction,
};
