import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SaleService } from "./sale.service.js";

const getAllSales = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.getAllSales(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sales retrieved successfully",
        data: result,
    });
});

const createSale = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.createSale(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Sale created successfully",
        data: result,
    });
});

const updateSale = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.updateSale(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale updated successfully",
        data: result,
    });
});

const deleteSale = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.deleteSale(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale deleted successfully",
        data: result,
    });
});

const addDelivery = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.addDelivery(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Delivery recorded successfully",
        data: result,
    });
});

const deleteDelivery = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.deleteDelivery(req.params.deliveryId as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Delivery removed successfully",
        data: result,
    });
});

const patchSale = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.patchSale(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Sale updated successfully",
        data: result,
    });
});

const setManualCost = catchAsync(async (req: Request, res: Response) => {
    const result = await SaleService.setManualCost(
        req.params.itemId as string,
        Number(req.body.unit_cost ?? 0),
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Purchase rate updated successfully",
        data: result,
    });
});

export const SaleController = {
    getAllSales,
    createSale,
    updateSale,
    patchSale,
    deleteSale,
    addDelivery,
    deleteDelivery,
    setManualCost,
};
