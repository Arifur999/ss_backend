import { Router } from "express";
import { AccountRoutes } from "../module/account/account.route.js";
import { AccountTransferRoutes } from "../module/accountTransfer/accountTransfer.route.js";
import { AuthRoutes } from "../module/auth/auth.route.js";
import { BusinessSettingsRoutes } from "../module/businessSettings/businessSettings.route.js";
import { CustomerRoutes } from "../module/customer/customer.route.js";
import { ExpenseCategoryRoutes } from "../module/expenseCategory/expenseCategory.route.js";
import { MonthlyTargetRoutes } from "../module/monthlyTarget/monthlyTarget.route.js";
import { ProductRoutes } from "../module/product/product.route.js";
import { ShareholderRoutes } from "../module/shareholder/shareholder.route.js";
import { SupplierRoutes } from "../module/supplier/supplier.route.js";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/business-settings", BusinessSettingsRoutes);
router.use("/shareholders", ShareholderRoutes);
router.use("/accounts", AccountRoutes);
router.use("/account-transfers", AccountTransferRoutes);
router.use("/monthly-targets", MonthlyTargetRoutes);
router.use("/expense-categories", ExpenseCategoryRoutes);
router.use("/suppliers", SupplierRoutes);
router.use("/customers", CustomerRoutes);
router.use("/products", ProductRoutes);

export const indexRoute = router;
