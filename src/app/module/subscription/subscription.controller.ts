import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SubscriptionService } from "./subscription.service.js";

const getMySubscription = catchAsync(async (req: Request, res: Response) => {
    const result = await SubscriptionService.getMySubscription(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Subscription retrieved successfully",
        data: result,
    });
});

const choosePlan = catchAsync(async (req: Request, res: Response) => {
    const result = await SubscriptionService.choosePlan(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Plan selected successfully",
        data: result,
    });
});

const submitManualPayment = catchAsync(async (req: Request, res: Response) => {
    const result = await SubscriptionService.submitManualPayment(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Payment submitted successfully - awaiting approval",
        data: result,
    });
});

export const SubscriptionController = {
    getMySubscription,
    choosePlan,
    submitManualPayment,
};
