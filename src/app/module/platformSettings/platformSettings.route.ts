import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PlatformSettingsController } from "./platformSettings.controller.js";
import { updatePlatformSettingsZodSchema } from "./platformSettings.validation.js";

const router = Router();

// Any logged-in user can read the payment info (needed on the checkout page
// before a subscription is even active, so no checkSubscription gate here).
router.get("/payment-info", checkAuth(), PlatformSettingsController.getPaymentInfo);

router.get("/", checkAuth(Role.super_admin), PlatformSettingsController.getFullSettings);
router.put("/", checkAuth(Role.super_admin), validateRequest(updatePlatformSettingsZodSchema), PlatformSettingsController.updateSettings);
router.post("/test-reminder", checkAuth(Role.super_admin), PlatformSettingsController.sendTestReminder);

export const PlatformSettingsRoutes = router;
