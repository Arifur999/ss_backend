import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PurchaseTargetController } from "./purchaseTarget.controller.js";
import { createPurchaseTargetZodSchema, updatePurchaseTargetZodSchema } from "./purchaseTarget.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, PurchaseTargetController.getAllTargets);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createPurchaseTargetZodSchema), PurchaseTargetController.createTarget);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updatePurchaseTargetZodSchema), PurchaseTargetController.updateTarget);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, PurchaseTargetController.deleteTarget);

export const PurchaseTargetRoutes = router;
