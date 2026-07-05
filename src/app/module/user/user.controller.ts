import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { UserService } from "./user.service.js";

const listTeamUsers = catchAsync(async (req: Request, res: Response) => {
    const result = await UserService.listTeamUsers(req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Team users retrieved successfully",
        data: result,
    });
});

const createTeamUser = catchAsync(async (req: Request, res: Response) => {
    const result = await UserService.createTeamUser(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Team user created successfully",
        data: result,
    });
});

const updateTeamUser = catchAsync(async (req: Request, res: Response) => {
    const result = await UserService.updateTeamUser(req.body, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Team user updated successfully",
        data: result,
    });
});

const deleteTeamUser = catchAsync(async (req: Request, res: Response) => {
    const result = await UserService.deleteTeamUser(req.body.user_id, req.user as IRequestUser);
    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Team user deleted successfully",
        data: result,
    });
});

export const UserController = {
    listTeamUsers,
    createTeamUser,
    updateTeamUser,
    deleteTeamUser,
};
