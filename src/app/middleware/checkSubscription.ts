import { NextFunction, Request, Response } from "express";
import status from "http-status";
import { Role } from "../../generated/prisma/enums.js";
import AppError from "../errorHelpers/AppError.js";
import { hasActiveOwnerAccess } from "../utils/subscription.js";

// Replaces the Supabase RLS rule:
//   (owner_id = auth.uid() AND has_active_owner_access(owner_id)) OR is_super_admin()
// Mount after checkAuth on every workspace route.
export const checkSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user;

        if (!user) {
            throw new AppError(status.UNAUTHORIZED, "Unauthorized access!");
        }

        if (user.role === Role.super_admin) {
            return next();
        }

        const isActive = await hasActiveOwnerAccess(user.ownerId);

        if (!isActive) {
            throw new AppError(
                status.FORBIDDEN,
                "Your subscription is not active. Please renew your plan or contact the administrator."
            );
        }

        next();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        next(error);
    }
};
