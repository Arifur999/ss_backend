import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SaleController } from "./sale.controller.js";
import { createSaleDeliveryZodSchema, createSaleZodSchema, updateSaleZodSchema } from "./sale.validation.js";

const router = Router();

const salesRoles = [Role.owner, Role.manager, Role.sales_staff] as const;

router.get("/", checkAuth(), checkSubscription, SaleController.getAllSales);
router.post("/", checkAuth(...salesRoles), checkSubscription, validateRequest(createSaleZodSchema), SaleController.createSale);
router.delete("/deliveries/:deliveryId", checkAuth(...salesRoles), checkSubscription, SaleController.deleteDelivery);
router.post("/:id/deliveries", checkAuth(...salesRoles), checkSubscription, validateRequest(createSaleDeliveryZodSchema), SaleController.addDelivery);
router.put("/:id", checkAuth(...salesRoles), checkSubscription, validateRequest(updateSaleZodSchema), SaleController.updateSale);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, SaleController.deleteSale);

export const SaleRoutes = router;
