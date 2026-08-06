import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PlatformFinanceController } from "./platformFinance.controller.js";
import {
    createPlatformExpenseZodSchema,
    createPlatformWithdrawalZodSchema,
    updatePlatformExpenseZodSchema,
    updatePlatformWithdrawalZodSchema,
} from "./platformFinance.validation.js";

// The platform's own books. Super admin only, and deliberately without
// checkSubscription - the super admin has no subscription of their own to
// check, so requiring one would lock the operator out of their own accounts.
const router = Router();

router.get("/expenses", checkAuth(Role.super_admin), PlatformFinanceController.getExpenses);
router.post("/expenses", checkAuth(Role.super_admin), validateRequest(createPlatformExpenseZodSchema), PlatformFinanceController.createExpense);
router.patch("/expenses/:id", checkAuth(Role.super_admin), validateRequest(updatePlatformExpenseZodSchema), PlatformFinanceController.updateExpense);
router.delete("/expenses/:id", checkAuth(Role.super_admin), PlatformFinanceController.deleteExpense);

router.get("/withdrawals", checkAuth(Role.super_admin), PlatformFinanceController.getWithdrawals);
router.post("/withdrawals", checkAuth(Role.super_admin), validateRequest(createPlatformWithdrawalZodSchema), PlatformFinanceController.createWithdrawal);
router.patch("/withdrawals/:id", checkAuth(Role.super_admin), validateRequest(updatePlatformWithdrawalZodSchema), PlatformFinanceController.updateWithdrawal);
router.delete("/withdrawals/:id", checkAuth(Role.super_admin), PlatformFinanceController.deleteWithdrawal);

router.get("/summary", checkAuth(Role.super_admin), PlatformFinanceController.getSummary);

export const PlatformFinanceRoutes = router;
