import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { LeadService } from "./lead.service.js";

const getAllLeads = catchAsync(async (req: Request, res: Response) => {
    const result = await LeadService.getAllLeads(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Leads retrieved successfully", data: result });
});

const createLead = catchAsync(async (req: Request, res: Response) => {
    const result = await LeadService.createLead(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "Lead saved successfully", data: result });
});

const updateLead = catchAsync(async (req: Request, res: Response) => {
    const result = await LeadService.updateLead(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Lead updated successfully", data: result });
});

const deleteLead = catchAsync(async (req: Request, res: Response) => {
    const result = await LeadService.deleteLead(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: result.message, data: result });
});

export const LeadController = { getAllLeads, createLead, updateLead, deleteLead };
