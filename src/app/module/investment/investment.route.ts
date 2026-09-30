import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { InvestmentController } from "./investment.controller.js";
import { createInvestmentZodSchema, updateInvestmentZodSchema } from "./investment.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.shareholders), InvestmentController.getAllInvestments);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:shareholders.invest"), validateRequest(createInvestmentZodSchema), InvestmentController.createInvestment);
router.patch("/:id", checkAuth(Role.owner), checkSubscription, validateRequest(updateInvestmentZodSchema), InvestmentController.updateInvestment);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, InvestmentController.deleteInvestment);

export const InvestmentRoutes = router;
