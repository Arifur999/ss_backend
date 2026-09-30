import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SalaryTransactionController } from "./salaryTransaction.controller.js";
import { createSalaryTransactionZodSchema, updateSalaryTransactionZodSchema } from "./salaryTransaction.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.salaryTransactions), SalaryTransactionController.getAllSalaryTransactions);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:employees.transactions"), validateRequest(createSalaryTransactionZodSchema), SalaryTransactionController.createSalaryTransaction);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:employees.transactions"), validateRequest(updateSalaryTransactionZodSchema), SalaryTransactionController.updateSalaryTransaction);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, SalaryTransactionController.deleteSalaryTransaction);

export const SalaryTransactionRoutes = router;
