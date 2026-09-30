import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SupplierPaymentController } from "./supplierPayment.controller.js";
import { createSupplierPaymentZodSchema, updateSupplierPaymentZodSchema } from "./supplierPayment.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.supplierPayments), SupplierPaymentController.getAllPayments);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:supplier.payments"), validateRequest(createSupplierPaymentZodSchema), SupplierPaymentController.createPayment);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:supplier.payments"), validateRequest(updateSupplierPaymentZodSchema), SupplierPaymentController.updatePayment);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, SupplierPaymentController.deletePayment);

export const SupplierPaymentRoutes = router;
