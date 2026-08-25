import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { SupportService } from "./support.service.js";
import { subscribe } from "./supportStream.js";

const createTicket = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.createTicket(req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.CREATED, message: "Support ticket submitted", data: result });
});

const getMyTickets = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.getMyTickets(req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Tickets retrieved successfully", data: result });
});

const getAllTickets = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.getAllTickets(req.query.status as string | undefined);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Tickets retrieved successfully", data: result });
});

const replyToTicket = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.replyToTicket(req.params.id as string, req.body, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Reply sent", data: result });
});

const markSolved = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.markSolved(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Ticket marked as solved", data: result });
});

const noteTyping = catchAsync(async (req: Request, res: Response) => {
    const result = await SupportService.noteTyping(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, { success: true, httpStatus: status.OK, message: "Noted", data: result });
});

/**
 * The live stream. Not wrapped in catchAsync or sendResponse: those end the
 * response, and this one deliberately stays open.
 */
const stream = (req: Request, res: Response) => {
    subscribe(res, req.user as IRequestUser);
};

export const SupportController = {
    createTicket,
    getMyTickets,
    getAllTickets,
    stream,
    noteTyping,
    replyToTicket,
    markSolved,
};
