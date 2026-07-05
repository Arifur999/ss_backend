import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SupplierService } from "./supplier.service.js";

const getAllSuppliers = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierService.getAllSuppliers(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Suppliers retrieved successfully",
        data: result,
    });
});

const createSupplier = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierService.createSupplier(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Supplier created successfully",
        data: result,
    });
});

const updateSupplier = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierService.updateSupplier(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Supplier updated successfully",
        data: result,
    });
});

const deleteSupplier = catchAsync(async (req: Request, res: Response) => {
    const result = await SupplierService.deleteSupplier(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Supplier deleted successfully",
        data: result,
    });
});

export const SupplierController = {
    getAllSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
};
