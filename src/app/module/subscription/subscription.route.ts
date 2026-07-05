import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SubscriptionController } from "./subscription.controller.js";
import { choosePlanZodSchema } from "./subscription.validation.js";

const router = Router();

// Note: no checkSubscription here - expired owners must still be able to
// view their subscription and choose a new plan.
router.get("/my", checkAuth(), SubscriptionController.getMySubscription);
router.post("/choose-plan", checkAuth(Role.owner), validateRequest(choosePlanZodSchema), SubscriptionController.choosePlan);

export const SubscriptionRoutes = router;
