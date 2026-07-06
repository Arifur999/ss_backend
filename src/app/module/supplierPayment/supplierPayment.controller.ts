import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SupplierPaymentService } from "./supplierPayment.service.js";

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierPaymentService.getAllPayments(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Supplier payments retrieved successfully",
        data: result,
    });
});

const createPayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierPaymentService.createPayment(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Supplier payment created successfully",
        data: result,
    });
});

const updatePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierPaymentService.updatePayment(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Supplier payment updated successfully",
        data: result,
    });
});

const deletePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierPaymentService.deletePayment(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Supplier payment deleted successfully",
        data: result,
    });
});

export const SupplierPaymentController = {
    getAllPayments,
    createPayment,
    updatePayment,
    deletePayment,
};
