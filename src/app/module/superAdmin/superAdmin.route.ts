import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SuperAdminController } from "./superAdmin.controller.js";
import { updateOwnerSubscriptionZodSchema, updateSubscriptionPaymentZodSchema } from "./superAdmin.validation.js";

const router = Router();

router.get("/owners", checkAuth(Role.super_admin), SuperAdminController.getAllOwners);
router.patch("/owners/:ownerId/subscription", checkAuth(Role.super_admin), validateRequest(updateOwnerSubscriptionZodSchema), SuperAdminController.updateOwnerSubscription);
router.post("/owners/:ownerId/grant-trial-extension", checkAuth(Role.super_admin), SuperAdminController.grantTrialExtension);
router.delete("/owners/:ownerId", checkAuth(Role.super_admin), SuperAdminController.deleteOwner);
router.get("/payments", checkAuth(Role.super_admin), SuperAdminController.getAllPayments);
router.patch("/payments/:id", checkAuth(Role.super_admin), validateRequest(updateSubscriptionPaymentZodSchema), SuperAdminController.updatePayment);
router.get("/activities", checkAuth(Role.super_admin), SuperAdminController.getActivities);
router.get("/stats", checkAuth(Role.super_admin), SuperAdminController.getDashboardStats);
router.get("/reports", checkAuth(Role.super_admin), SuperAdminController.getPlatformReports);

export const SuperAdminRoutes = router;
