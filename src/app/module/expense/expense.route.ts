import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ExpenseController } from "./expense.controller.js";
import { createExpenseZodSchema, updateExpenseZodSchema } from "./expense.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.expenses), ExpenseController.getAllExpenses);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:expenses.transactions"), validateRequest(createExpenseZodSchema), ExpenseController.createExpense);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:expenses.transactions"), validateRequest(updateExpenseZodSchema), ExpenseController.updateExpense);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, ExpenseController.deleteExpense);

export const ExpenseRoutes = router;
