import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PurchaseController } from "./purchase.controller.js";
import {
    createPurchaseZodSchema,
    receivePurchaseItemZodSchema,
    updatePurchaseZodSchema,
    updateReceiveZodSchema,
} from "./purchase.validation.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, PurchaseController.getAllPurchases);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createPurchaseZodSchema), PurchaseController.createPurchase);
router.patch("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateReceiveZodSchema), PurchaseController.updateReceive);
router.delete("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, PurchaseController.deleteReceive);
router.patch("/items/:itemId/received-qty", checkAuth(Role.owner, Role.manager), checkSubscription, PurchaseController.setItemReceivedQty);
router.post("/:id/receive", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(receivePurchaseItemZodSchema), PurchaseController.receivePurchaseItem);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updatePurchaseZodSchema), PurchaseController.updatePurchase);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, PurchaseController.deletePurchase);

export const PurchaseRoutes = router;
