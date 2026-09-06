import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ReportService } from "./report.service.js";

const emailReport = catchAsync(async (req: Request, res: Response) => {
    const result = await ReportService.emailReport(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: `Report sent to ${result.email}`,
        data: result,
    });
});

export const ReportController = { emailReport };
