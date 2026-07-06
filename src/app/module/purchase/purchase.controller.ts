import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { PurchaseService } from "./purchase.service.js";

const getAllPurchases = catchAsync(async (req: Request, res: Response) => {
    const statuses = typeof req.query.status === "string" && req.query.status.length > 0
        ? req.query.status.split(",").map((value) => value.trim())
        : undefined;
    const result = await PurchaseService.getAllPurchases(req.user as IRequestUser, statuses);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Purchases retrieved successfully",
        data: result,
    });
});

const createPurchase = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.createPurchase(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Purchase created successfully",
        data: result,
    });
});

const updatePurchase = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.updatePurchase(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Purchase updated successfully",
        data: result,
    });
});

const receivePurchaseItem = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.receivePurchaseItem(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Items received successfully",
        data: result,
    });
});

const updateReceive = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.updateReceive(
        req.params.receiveId as string,
        req.body.received_qty,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Receive updated successfully",
        data: result,
    });
});

const setItemReceivedQty = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.setItemReceivedQty(
        req.params.itemId as string,
        Number(req.body.received_qty ?? 0),
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Received quantity updated successfully",
        data: result,
    });
});

const deleteReceive = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.deleteReceive(req.params.receiveId as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Receive deleted successfully",
        data: result,
    });
});

const deletePurchase = catchAsync(async (req: Request, res: Response) => {
    const result = await PurchaseService.deletePurchase(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Purchase deleted successfully",
        data: result,
    });
});

export const PurchaseController = {
    getAllPurchases,
    createPurchase,
    updatePurchase,
    receivePurchaseItem,
    updateReceive,
    deleteReceive,
    setItemReceivedQty,
    deletePurchase,
};
