import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { EmployeeService } from "./employee.service.js";

const getAllEmployees = catchAsync(async (req: Request, res: Response) => {
    const result = await EmployeeService.getAllEmployees(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Employees retrieved successfully",
        data: result,
    });
});

const createEmployee = catchAsync(async (req: Request, res: Response) => {
    const result = await EmployeeService.createEmployee(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Employee created successfully",
        data: result,
    });
});

const updateEmployee = catchAsync(async (req: Request, res: Response) => {
    const result = await EmployeeService.updateEmployee(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Employee updated successfully",
        data: result,
    });
});

const deleteEmployee = catchAsync(async (req: Request, res: Response) => {
    const result = await EmployeeService.deleteEmployee(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Employee deleted successfully",
        data: result,
    });
});

export const EmployeeController = {
    getAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
};
