import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { parseListOptions } from "../../shared/listQuery.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { LoanService } from "./loan.service.js";

const getAllLoans = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanService.getAllLoans(req.user as IRequestUser, parseListOptions(req.query as Record<string, unknown>));
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loans retrieved successfully",
        data: result,
    });
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const getLenderStatement = catchAsync(async (req: Request, res: Response) => {
    // A malformed date is dropped rather than 400ing: an unbounded statement is
    // a sensible answer to a broken filter, an error page is not.
    const day = (value: unknown) => {
        const text = String(value || "");
        return ISO_DAY.test(text) ? text : undefined;
    };

    const result = await LoanService.getLenderStatement(
        {
            lenderId: String(req.query.lender_id || ""),
            from: day(req.query.from),
            to: day(req.query.to),
        },
        req.user as IRequestUser
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Statement retrieved successfully",
        data: result,
    });
});

const createLoan = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanService.createLoan(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Loan transaction created successfully",
        data: result,
    });
});

const updateLoan = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanService.updateLoan(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loan transaction updated successfully",
        data: result,
    });
});

const deleteLoan = catchAsync(async (req: Request, res: Response) => {
    const result = await LoanService.deleteLoan(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Loan transaction deleted successfully",
        data: result,
    });
});

export const LoanController = {
    getLenderStatement,
    getAllLoans,
    createLoan,
    updateLoan,
    deleteLoan,
};
