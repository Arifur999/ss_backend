import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SmsService } from "./sms.service.js";

// ---- Owner ----------------------------------------------------------------

const getMyWallet = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getMyWallet(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Wallet retrieved successfully", data: result });
});

const getPackages = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getActivePackages();
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS packages retrieved successfully", data: result });
});

const submitPurchase = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.submitPurchase(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "Purchase submitted - awaiting approval", data: result });
});

const getMyPurchases = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getMyPurchases(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Purchases retrieved successfully", data: result });
});

const sendSms = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.sendSms(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS sent successfully", data: result });
});

const getMyMessages = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getMyMessages(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS history retrieved successfully", data: result });
});

// ---- Super admin ----------------------------------------------------------

const getAllPackages = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getAllPackages();
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS packages retrieved successfully", data: result });
});

const createPackage = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.createPackage(req.body);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "SMS package created successfully", data: result });
});

const updatePackage = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.updatePackage(req.params.id as string, req.body);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS package updated successfully", data: result });
});

const deletePackage = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.deletePackage(req.params.id as string);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS package deleted successfully", data: result });
});

const getAllPurchases = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getAllPurchases();
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS purchases retrieved successfully", data: result });
});

const updatePurchaseStatus = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.updatePurchaseStatus(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS purchase updated successfully", data: result });
});

const getMasterBalance = catchAsync(async (req: Request, res: Response) => {
    const result = await SmsService.getMasterBalance();
    sendResponse(res, { success: true, httpStatus: status.OK, message: "SMS balance retrieved successfully", data: result });
});

export const SmsController = {
    getMyWallet,
    getPackages,
    submitPurchase,
    getMyPurchases,
    sendSms,
    getMyMessages,
    getAllPackages,
    createPackage,
    updatePackage,
    deletePackage,
    getAllPurchases,
    updatePurchaseStatus,
    getMasterBalance,
};
