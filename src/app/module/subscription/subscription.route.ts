import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SubscriptionController } from "./subscription.controller.js";
import { choosePlanZodSchema, submitManualPaymentZodSchema } from "./subscription.validation.js";

const router = Router();

// Note: no checkSubscription here - expired owners must still be able to
// view their subscription, choose a new plan, and submit a payment.
router.get("/my", checkAuth(), SubscriptionController.getMySubscription);
router.post("/choose-plan", checkAuth(Role.owner), validateRequest(choosePlanZodSchema), SubscriptionController.choosePlan);
router.post("/submit-payment", checkAuth(Role.owner), validateRequest(submitManualPaymentZodSchema), SubscriptionController.submitManualPayment);

export const SubscriptionRoutes = router;
