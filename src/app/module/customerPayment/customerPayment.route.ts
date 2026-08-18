import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { CustomerPaymentController } from "./customerPayment.controller.js";
import { createCustomerPaymentZodSchema, updateCustomerPaymentZodSchema } from "./customerPayment.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission("View Due"), CustomerPaymentController.getAllPayments);
router.post("/", checkAuth(Role.owner, Role.manager, Role.sales_staff, Role.accountant), checkSubscription, requirePermission("Add Due"), validateRequest(createCustomerPaymentZodSchema), CustomerPaymentController.createPayment);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Edit Due"), validateRequest(updateCustomerPaymentZodSchema), CustomerPaymentController.updatePayment);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Delete Due"), CustomerPaymentController.deletePayment);

export const CustomerPaymentRoutes = router;
