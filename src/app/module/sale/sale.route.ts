import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SaleController } from "./sale.controller.js";
import { createSaleDeliveryZodSchema, createSaleZodSchema, patchSaleZodSchema, setManualCostZodSchema, updateSaleZodSchema } from "./sale.validation.js";

const router = Router();

const salesRoles = [Role.owner, Role.manager, Role.sales_staff] as const;

router.get("/", checkAuth(), checkSubscription, requirePermission("View Sales"), SaleController.getAllSales);
router.post("/", checkAuth(...salesRoles), checkSubscription, requirePermission("New Sale"), validateRequest(createSaleZodSchema), SaleController.createSale);
router.delete("/deliveries/:deliveryId", checkAuth(...salesRoles), checkSubscription, requirePermission("Edit Sale"), SaleController.deleteDelivery);
router.post("/:id/deliveries", checkAuth(...salesRoles), checkSubscription, requirePermission("Edit Sale"), validateRequest(createSaleDeliveryZodSchema), SaleController.addDelivery);
router.post("/items/:itemId/manual-cost", checkAuth(...salesRoles), checkSubscription, requirePermission("Edit Sale"), validateRequest(setManualCostZodSchema), SaleController.setManualCost);
router.put("/:id", checkAuth(...salesRoles), checkSubscription, requirePermission("Edit Sale"), validateRequest(updateSaleZodSchema), SaleController.updateSale);
router.patch("/:id", checkAuth(...salesRoles), checkSubscription, requirePermission("Edit Sale"), validateRequest(patchSaleZodSchema), SaleController.patchSale);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Delete Sale"), SaleController.deleteSale);

export const SaleRoutes = router;
