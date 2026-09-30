import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PurchaseTargetController } from "./purchaseTarget.controller.js";
import { createPurchaseTargetZodSchema, updatePurchaseTargetZodSchema } from "./purchaseTarget.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.targets), PurchaseTargetController.getAllTargets);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:reports.purchase-target"), validateRequest(createPurchaseTargetZodSchema), PurchaseTargetController.createTarget);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:reports.purchase-target"), validateRequest(updatePurchaseTargetZodSchema), PurchaseTargetController.updateTarget);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:reports.delete"), PurchaseTargetController.deleteTarget);

export const PurchaseTargetRoutes = router;
