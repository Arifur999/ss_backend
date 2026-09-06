import { Request, Response } from "express";
import status from "http-status";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { DraftService } from "./draft.service.js";
import { DRAFT_KINDS, IDraftKind } from "./draft.validation.js";

const listDrafts = catchAsync(async (req: Request, res: Response) => {
    // An unrecognised ?kind= returns everything rather than 400ing: this is a
    // list, and the query string is a filter, not an instruction.
    const requested = String(req.query.kind || "");
    const kind = (DRAFT_KINDS as readonly string[]).includes(requested)
        ? (requested as IDraftKind)
        : undefined;

    const result = await DraftService.listDrafts(kind, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Drafts retrieved successfully",
        data: result,
    });
});

const getDraft = catchAsync(async (req: Request, res: Response) => {
    const result = await DraftService.getDraft(req.params.id as string, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Draft retrieved successfully",
        data: result,
    });
});

const saveDraft = catchAsync(async (req: Request, res: Response) => {
    const result = await DraftService.saveDraft(req.body, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.CREATED,
        message: "Draft saved",
        data: result,
    });
});

const updateDraft = catchAsync(async (req: Request, res: Response) => {
    const result = await DraftService.updateDraft(
        req.params.id as string,
        req.body,
        req.user as IRequestUser
    );

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Draft updated",
        data: result,
    });
});

const deleteDraft = catchAsync(async (req: Request, res: Response) => {
    const result = await DraftService.deleteDraft(req.params.id as string, req.user as IRequestUser);

    sendResponse(res, {
        success: true,
        httpStatus: status.OK,
        message: "Draft deleted",
        data: result,
    });
});

export const DraftController = { listDrafts, getDraft, saveDraft, updateDraft, deleteDraft };
