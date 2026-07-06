import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ProfitWithdrawalController } from "./profitWithdrawal.controller.js";
import { createProfitWithdrawalZodSchema, updateProfitWithdrawalZodSchema } from "./profitWithdrawal.validation.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, ProfitWithdrawalController.getAllProfitWithdrawals);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createProfitWithdrawalZodSchema), ProfitWithdrawalController.createProfitWithdrawal);
router.patch("/:id", checkAuth(Role.owner), checkSubscription, validateRequest(updateProfitWithdrawalZodSchema), ProfitWithdrawalController.updateProfitWithdrawal);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, ProfitWithdrawalController.deleteProfitWithdrawal);

export const ProfitWithdrawalRoutes = router;
