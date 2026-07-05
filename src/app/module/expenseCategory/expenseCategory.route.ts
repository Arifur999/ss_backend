import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ExpenseCategoryController } from "./expenseCategory.controller.js";
import { createExpenseCategoryZodSchema, updateExpenseCategoryZodSchema } from "./expenseCategory.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, ExpenseCategoryController.getAllCategories);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, validateRequest(createExpenseCategoryZodSchema), ExpenseCategoryController.createCategory);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, validateRequest(updateExpenseCategoryZodSchema), ExpenseCategoryController.updateCategory);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, ExpenseCategoryController.deleteCategory);

export const ExpenseCategoryRoutes = router;
