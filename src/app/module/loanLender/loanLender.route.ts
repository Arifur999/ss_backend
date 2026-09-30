import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { LoanLenderController } from "./loanLender.controller.js";
import { createLoanLenderZodSchema, updateLoanLenderZodSchema } from "./loanLender.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.loans), LoanLenderController.getAllLenders);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:loans.lenders"), validateRequest(createLoanLenderZodSchema), LoanLenderController.createLender);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:loans.lenders"), validateRequest(updateLoanLenderZodSchema), LoanLenderController.updateLender);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, LoanLenderController.deleteLender);

export const LoanLenderRoutes = router;
