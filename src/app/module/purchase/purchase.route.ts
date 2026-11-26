import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PurchaseController } from "./purchase.controller.js";
import { addPurchaseItemZodSchema, createPurchaseZodSchema, createReceiveMemoZodSchema, receiveAllZodSchema, receivePurchaseItemZodSchema, setItemReceivedQtyZodSchema, updatePurchaseItemZodSchema, updatePurchaseZodSchema, updateReceiveZodSchema } from "./purchase.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.purchases), PurchaseController.getAllPurchases);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders"), validateRequest(createPurchaseZodSchema), PurchaseController.createPurchase);
router.patch("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.pending", "page:purchase.receiveLedger"), validateRequest(updateReceiveZodSchema), PurchaseController.updateReceive);
router.delete("/receives/:receiveId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.pending", "page:purchase.receiveLedger"), PurchaseController.deleteReceive);
// Before every "/:id" route below it: Express takes the first match, and
// "/receive-memos" would otherwise be read as a purchase id.
router.get("/receive-memos", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.purchaseReceiveMemos), PurchaseController.getReceiveMemos);
router.post("/receive-memos", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.pending"), validateRequest(createReceiveMemoZodSchema), PurchaseController.createReceiveMemo);
router.delete("/receive-memos/:memoId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.receiveLedger"), PurchaseController.deleteReceiveMemo);
router.patch("/items/:itemId/received-qty", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.pending"), validateRequest(setItemReceivedQtyZodSchema), PurchaseController.setItemReceivedQty);
router.patch("/items/:itemId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.drafts"), validateRequest(updatePurchaseItemZodSchema), PurchaseController.updatePurchaseItem);
router.delete("/items/:itemId", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:purchase.delete"), PurchaseController.deletePurchaseItem);
router.post("/:id/items", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.drafts"), validateRequest(addPurchaseItemZodSchema), PurchaseController.addPurchaseItem);
router.post("/:id/receive-all", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders"), validateRequest(receiveAllZodSchema), PurchaseController.receiveAllPurchaseItems);
router.post("/:id/receive", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.pending"), validateRequest(receivePurchaseItemZodSchema), PurchaseController.receivePurchaseItem);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:purchase.orders", "page:purchase.drafts"), validateRequest(updatePurchaseZodSchema), PurchaseController.updatePurchase);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:purchase.delete"), PurchaseController.deletePurchase);

export const PurchaseRoutes = router;
