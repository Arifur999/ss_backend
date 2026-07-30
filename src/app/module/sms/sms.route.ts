import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SmsController } from "./sms.controller.js";
import {
    createSmsPackageZodSchema,
    sendSmsZodSchema,
    submitSmsPurchaseZodSchema,
    updateSmsPackageZodSchema,
    updateSmsPurchaseZodSchema,
} from "./sms.validation.js";

const router = Router();

// ---- Super admin (declared first so /admin/* isn't shadowed by owner routes) ----
router.get("/admin/packages", checkAuth(Role.super_admin), SmsController.getAllPackages);
router.post("/admin/packages", checkAuth(Role.super_admin), validateRequest(createSmsPackageZodSchema), SmsController.createPackage);
router.patch("/admin/packages/:id", checkAuth(Role.super_admin), validateRequest(updateSmsPackageZodSchema), SmsController.updatePackage);
router.delete("/admin/packages/:id", checkAuth(Role.super_admin), SmsController.deletePackage);
router.get("/admin/purchases", checkAuth(Role.super_admin), SmsController.getAllPurchases);
router.patch("/admin/purchases/:id", checkAuth(Role.super_admin), validateRequest(updateSmsPurchaseZodSchema), SmsController.updatePurchaseStatus);
router.get("/admin/balance", checkAuth(Role.super_admin), SmsController.getMasterBalance);

// ---- Owner ----
router.get("/wallet", checkAuth(Role.owner), SmsController.getMyWallet);
router.get("/packages", checkAuth(Role.owner), SmsController.getPackages);
router.post("/purchases", checkAuth(Role.owner), validateRequest(submitSmsPurchaseZodSchema), SmsController.submitPurchase);
router.get("/purchases", checkAuth(Role.owner), SmsController.getMyPurchases);
router.post("/send", checkAuth(Role.owner), validateRequest(sendSmsZodSchema), SmsController.sendSms);
router.get("/messages", checkAuth(Role.owner), SmsController.getMyMessages);

export const SmsRoutes = router;
