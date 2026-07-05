import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { BusinessSettingsController } from "./businessSettings.controller.js";
import { upsertBusinessSettingsZodSchema } from "./businessSettings.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, BusinessSettingsController.getBusinessSettings);
router.put(
    "/",
    checkAuth(Role.owner),
    checkSubscription,
    validateRequest(upsertBusinessSettingsZodSchema),
    BusinessSettingsController.upsertBusinessSettings
);

export const BusinessSettingsRoutes = router;
