import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { MarketingContactService } from "./marketingContact.service.js";

const getAllContacts = catchAsync(async (req: Request, res: Response) => {
    const result = await MarketingContactService.getAllContacts(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Marketing contacts retrieved successfully",
        data: result,
    });
});

const createContact = catchAsync(async (req: Request, res: Response) => {
    const result = await MarketingContactService.createContact(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Marketing contact created successfully",
        data: result,
    });
});

const updateContact = catchAsync(async (req: Request, res: Response) => {
    const result = await MarketingContactService.updateContact(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Marketing contact updated successfully",
        data: result,
    });
});

const deleteContact = catchAsync(async (req: Request, res: Response) => {
    const result = await MarketingContactService.deleteContact(
        req.params.id as string,
        req.user as IRequestUser
    );
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Marketing contact deleted successfully",
        data: result,
    });
});

export const MarketingContactController = {
    getAllContacts,
    createContact,
    updateContact,
    deleteContact,
};
