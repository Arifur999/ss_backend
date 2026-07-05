import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SuperAdminService } from "./superAdmin.service.js";

const getAllOwners = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.getAllOwners();
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Owners retrieved successfully",
        data: result,
    });
});

const updateOwnerSubscription = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.updateOwnerSubscription(
        req.params.ownerId as string,
        req.body,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Owner subscription updated successfully",
        data: result,
    });
});

const grantTrialExtension = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.grantTrialExtension(
        req.params.ownerId as string,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Trial extension granted successfully",
        data: result,
    });
});

const deleteOwner = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.deleteOwner(req.params.ownerId as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Owner deleted successfully",
        data: result,
    });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.getAllPayments();
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Payments retrieved successfully",
        data: result,
    });
});

const updatePayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.updatePayment(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Payment updated successfully",
        data: result,
    });
});

const getActivities = catchAsync(async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const result = await SuperAdminService.getActivities(limit);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Activities retrieved successfully",
        data: result,
    });
});

const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.getDashboardStats();
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Dashboard stats retrieved successfully",
        data: result,
    });
});

export const SuperAdminController = {
    getAllOwners,
    updateOwnerSubscription,
    grantTrialExtension,
    deleteOwner,
    getAllPayments,
    updatePayment,
    getActivities,
    getDashboardStats,
};
