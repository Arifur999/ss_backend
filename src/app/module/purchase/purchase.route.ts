import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PurchaseController } from "./purchase.controller.js";
import { createPurchaseZodSchema, receiveAllZodSchema, receivePurchaseItemZodSchema, setItemReceivedQtyZodSchema, updatePurchaseItemZodSchema, updatePurchaseZodSchema, updateReceiveZodSchema } from "./purchase.validation.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("View Purchase"), PurchaseController.getAllPurchases);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Add Purchase"), validateRequest(createPurchaseZodSchema), PurchaseController.createPurchase);
router.patch("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Stock"), validateRequest(updateReceiveZodSchema), PurchaseController.updateReceive);
router.delete("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Stock"), PurchaseController.deleteReceive);
router.patch("/items/:itemId/received-qty", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Stock"), validateRequest(setItemReceivedQtyZodSchema), PurchaseController.setItemReceivedQty);
router.patch("/items/:itemId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Edit Purchase"), validateRequest(updatePurchaseItemZodSchema), PurchaseController.updatePurchaseItem);
router.delete("/items/:itemId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Delete Purchase"), PurchaseController.deletePurchaseItem);
router.post("/:id/receive-all", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Stock"), validateRequest(receiveAllZodSchema), PurchaseController.receiveAllPurchaseItems);
router.post("/:id/receive", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Stock"), validateRequest(receivePurchaseItemZodSchema), PurchaseController.receivePurchaseItem);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Edit Purchase"), validateRequest(updatePurchaseZodSchema), PurchaseController.updatePurchase);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Delete Purchase"), PurchaseController.deletePurchase);

export const PurchaseRoutes = router;
