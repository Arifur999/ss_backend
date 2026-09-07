import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ActivityService } from "./activity.service.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const getDayActivity = catchAsync(async (req: Request, res: Response) => {
    // A malformed ?date= falls back to today rather than 400ing: this is a
    // read-only feed, and a broken query string should show something.
    const requested = String(req.query.date || "");
    const day = ISO_DAY.test(requested) ? requested : new Date().toISOString().slice(0, 10);

    const result = await ActivityService.getDayActivity(day, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Activity retrieved successfully",
        data: result,
    });
});

export const ActivityController = { getDayActivity };
