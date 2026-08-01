import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { NotificationService } from "./notification.service.js";

const createNotification = catchAsync(async (req: Request, res: Response) => {
    const result = await NotificationService.createNotification(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "Notification sent to all users", data: result });
});

const getAllNotifications = catchAsync(async (_req: Request, res: Response) => {
    const result = await NotificationService.getAllNotifications();
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Notifications retrieved successfully", data: result });
});

const deleteNotification = catchAsync(async (req: Request, res: Response) => {
    const result = await NotificationService.deleteNotification(req.params.id as string);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Notification deleted successfully", data: result });
});

const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
    const result = await NotificationService.getMyNotifications(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Notifications retrieved successfully", data: result });
});

const markAllRead = catchAsync(async (req: Request, res: Response) => {
    const result = await NotificationService.markAllRead(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Notifications marked as read", data: result });
});

export const NotificationController = {
    createNotification,
    getAllNotifications,
    deleteNotification,
    getMyNotifications,
    markAllRead,
};
