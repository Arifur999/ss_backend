import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ProductService } from "./product.service.js";

const getAllProducts = catchAsync(async (req: Request, res: Response) => {
    const includeDeleted = req.query.deleted === "true";
    const result = await ProductService.getAllProducts(req.user as IRequestUser, includeDeleted);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Products retrieved successfully",
        data: result,
    });
});

const createProduct = catchAsync(async (req: Request, res: Response) => {
    const result = await ProductService.createProduct(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Product created successfully",
        data: result,
    });
});

const bulkUpsertProducts = catchAsync(async (req: Request, res: Response) => {
    const result = await ProductService.bulkUpsertProducts(req.body.products, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Products imported successfully",
        data: result,
    });
});

const updateProduct = catchAsync(async (req: Request, res: Response) => {
    const result = await ProductService.updateProduct(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Product updated successfully",
        data: result,
    });
});

const deleteProduct = catchAsync(async (req: Request, res: Response) => {
    const result = await ProductService.deleteProduct(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Product moved to recycle bin",
        data: result,
    });
});

export const ProductController = {
    getAllProducts,
    createProduct,
    bulkUpsertProducts,
    updateProduct,
    deleteProduct,
};
