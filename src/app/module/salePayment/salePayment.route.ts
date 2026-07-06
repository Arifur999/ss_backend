import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SalePaymentController } from "./salePayment.controller.js";
import { createSalePaymentZodSchema, updateSalePaymentZodSchema } from "./salePayment.validation.js";

const router = Router();

const payRoles = [Role.owner, Role.manager, Role.sales_staff, Role.accountant] as const;

router.get("/", checkAuth(), checkSubscription, SalePaymentController.getAllPayments);
router.post("/", checkAuth(...payRoles), checkSubscription, validateRequest(createSalePaymentZodSchema), SalePaymentController.createPayment);
router.patch("/:id", checkAuth(...payRoles), checkSubscription, validateRequest(updateSalePaymentZodSchema), SalePaymentController.updatePayment);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, SalePaymentController.deletePayment);

export const SalePaymentRoutes = router;
