import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SalePaymentService } from "./salePayment.service.js";

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const result = await SalePaymentService.getAllPayments(
        req.user as IRequestUser,
        req.query.sale_id as string | undefined
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale payments retrieved successfully",
        data: result,
    });
});

const createPayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SalePaymentService.createPayment(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Sale payment created successfully",
        data: result,
    });
});

const updatePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SalePaymentService.updatePayment(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale payment updated successfully",
        data: result,
    });
});

const deletePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SalePaymentService.deletePayment(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale payment deleted successfully",
        data: result,
    });
});

export const SalePaymentController = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
