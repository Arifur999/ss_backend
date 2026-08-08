import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { parseListOptions, paginationMeta } from "../../shared/listQuery.js";
import { CustomerService } from "./customer.service.js";

const getAllCustomers = catchAsync(async (req: Request, res: Response) => {
    const options = parseListOptions(req.query as Record<string, unknown>);
    const { rows, total } = await CustomerService.getAllCustomers(req.user as IRequestUser, options);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customers retrieved successfully",
        // Still a plain array, so a caller that ignores meta sees what it saw
        // before.
        data: rows,
        meta: paginationMeta(options, total),
    });
});

const createCustomer = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerService.createCustomer(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Customer created successfully",
        data: result,
    });
});

const updateCustomer = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerService.updateCustomer(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customer updated successfully",
        data: result,
    });
});

const deleteCustomer = catchAsync(async (req: Request, res: Response) => {
    const result = await CustomerService.deleteCustomer(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Customer deleted successfully",
        data: result,
    });
});

export const CustomerController = {
    getAllCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
