import { NextFunction, Request, Response } from "express";
import z from "zod";

export const validateRequest = (zodSchema: z.ZodType) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (req.body && typeof req.body.data === "string") {
            req.body = JSON.parse(req.body.data);
        }

        const parseResult = zodSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: parseResult.error.issues,
            });
        }

        req.body = parseResult.data;
        next();
    };
};
