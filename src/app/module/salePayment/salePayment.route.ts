import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SalePaymentController } from "./salePayment.controller.js";
import { createSalePaymentZodSchema, updateSalePaymentZodSchema } from "./salePayment.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

const payRoles = [Role.owner, Role.manager, Role.sales_staff, Role.accountant] as const;

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.salePayments), SalePaymentController.getAllPayments);
router.post("/", checkAuth(...payRoles), checkSubscription, requirePermission("page:customers.due-received", "page:sales.new"), validateRequest(createSalePaymentZodSchema), SalePaymentController.createPayment);
router.patch("/:id", checkAuth(...payRoles), checkSubscription, requirePermission("page:customers.due-received", "page:sales.new"), validateRequest(updateSalePaymentZodSchema), SalePaymentController.updatePayment);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:sales.delete", "act:customers.delete"), SalePaymentController.deletePayment);

export const SalePaymentRoutes = router;
