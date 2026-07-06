import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { OtherIncomeController } from "./otherIncome.controller.js";
import { createOtherIncomeZodSchema, updateOtherIncomeZodSchema } from "./otherIncome.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, OtherIncomeController.getAllOtherIncomes);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, validateRequest(createOtherIncomeZodSchema), OtherIncomeController.createOtherIncome);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateOtherIncomeZodSchema), OtherIncomeController.updateOtherIncome);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, OtherIncomeController.deleteOtherIncome);

export const OtherIncomeRoutes = router;
