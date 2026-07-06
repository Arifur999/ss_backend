import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { CustomerPaymentService } from "./customerPayment.service.js";

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerPaymentService.getAllPayments(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customer payments retrieved successfully",
        data: result,
    });
});

const createPayment = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerPaymentService.createPayment(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Customer payment created successfully",
        data: result,
    });
});

const updatePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerPaymentService.updatePayment(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customer payment updated successfully",
        data: result,
    });
});

const deletePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerPaymentService.deletePayment(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customer payment deleted successfully",
        data: result,
    });
});

export const CustomerPaymentController = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
