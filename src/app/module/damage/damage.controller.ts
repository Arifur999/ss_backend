import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { parseListOptions } from "../../shared/listQuery.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { DamageService } from "./damage.service.js";

const getAllDamageEntries = catchAsync(async (req: Request, res: Response) => {
    const statuses =
        typeof req.query.status === "string" && req.query.status.length > 0
            ? req.query.status.split(",").map((value) => value.trim())
            : undefined;
    const options = parseListOptions(req.query as Record<string, unknown>);
    const result = await DamageService.getAllDamageEntries(req.user as IRequestUser, statuses, options);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Damage entries retrieved successfully",
        data: result,
    });
});

const createDamageEntry = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.createDamageEntry(req.body, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Damage entry created successfully",
        data: result,
    });
});

const updateDamageEntry = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.updateDamageEntry(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Damage entry updated successfully",
        data: result,
    });
});

const receiveDamageItem = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.receiveDamageItem(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Damage item received successfully",
        data: result,
    });
});

const deleteDamageEntry = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.deleteDamageEntry(
        req.params.id as string,
        req.user as IRequestUser,
        req.body?.recycle
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Damage entry deleted successfully",
        data: result,
    });
});

const getDamageTransactions = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.getDamageTransactions(req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Damage transactions retrieved successfully",
        data: result,
    });
});

const addDamageTransaction = catchAsync(async (req: Request, res: Response) => {
    const result = await DamageService.addDamageTransaction(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Damage transaction saved successfully",
        data: result,
    });
});

export const DamageController = {
    getAllDamageEntries,
    createDamageEntry,
    updateDamageEntry,
    receiveDamageItem,
    deleteDamageEntry,
    getDamageTransactions,
    addDamageTransaction,
};
