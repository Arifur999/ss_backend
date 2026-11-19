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
// Two pages now set a target: the purchase-target report, which always did,
// and the Suppliers group's own Targets page. Either permission is enough -
// holding one of them is what makes a target yours to write, and a manager
// given only the supplier page would otherwise get a 403 on every save from a
// page the same permission let them open.
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:reports.purchase-target", "page:supplier.targets"), validateRequest(createPurchaseTargetZodSchema), PurchaseTargetController.createTarget);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:reports.purchase-target", "page:supplier.targets"), validateRequest(updatePurchaseTargetZodSchema), PurchaseTargetController.updateTarget);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:reports.delete", "act:supplier.delete"), PurchaseTargetController.deleteTarget);

export const PurchaseTargetRoutes = router;
