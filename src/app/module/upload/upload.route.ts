import { Request, Response, Router } from "express";
import status from "http-status";
import { multerUpload } from "../../../config/multer.config.js";
import AppError from "../../errorHelpers/AppError.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";

const router = Router();

// Generic image upload (product images, business logo). Returns the
// hosted Cloudinary URL to store in image_url / logo_url fields.
router.post(
    "/image",
    checkAuth(),
    checkSubscription,
    multerUpload.single("image"),
    catchAsync(async (req: Request, res: Response) => {
        if (!req.file) {
            throw new AppError(status.BAD_REQUEST, "No image file provided (field name: image)");
        }

        sendResponse(res, {
            success: true,
            httpStatus: status.CREATED,
            message: "Image uploaded successfully",
            data: {
                url: req.file.path,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                public_id: (req.file as any).filename,
            },
        });
    })
);

export const UploadRoutes = router;
