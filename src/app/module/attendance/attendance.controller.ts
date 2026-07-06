import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AttendanceService } from "./attendance.service.js";

const getAllAttendance = catchAsync(async (req: Request, res: Response) => {
    const result = await AttendanceService.getAllAttendance(req.user as IRequestUser, {
        employee_id: req.query.employee_id as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
    });
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Attendance retrieved successfully",
        data: result,
    });
});

const upsertAttendance = catchAsync(async (req: Request, res: Response) => {
    const result = await AttendanceService.upsertAttendance(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Attendance saved successfully",
        data: result,
    });
});

const deleteAttendance = catchAsync(async (req: Request, res: Response) => {
    const result = await AttendanceService.deleteAttendance(req.params.id as string, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Attendance deleted successfully",
        data: result,
    });
});

export const AttendanceController = {
    getAllAttendance,
    upsertAttendance,
    deleteAttendance,
};
