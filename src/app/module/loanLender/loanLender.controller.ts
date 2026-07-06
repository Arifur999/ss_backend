import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { LoanLenderService } from "./loanLender.service.js";

const getAllLenders = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanLenderService.getAllLenders(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loan lenders retrieved successfully",
        data: result,
    });
});

const createLender = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanLenderService.createLender(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Loan lender created successfully",
        data: result,
    });
});

const updateLender = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanLenderService.updateLender(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loan lender updated successfully",
        data: result,
    });
});

const deleteLender = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanLenderService.deleteLender(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loan lender deleted successfully",
        data: result,
    });
});

export const LoanLenderController = {
    getAllLenders,
    createLender,
    updateLender,
    deleteLender,
};
