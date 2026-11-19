import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { OtherIncomeController } from "./otherIncome.controller.js";
import { createOtherIncomeZodSchema, updateOtherIncomeZodSchema } from "./otherIncome.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

// Supplier commission is an other-income row, and it is now entered from the
// supplier book or the Transactions page rather than from an Others Income
// page of its own. Either of those permissions may write one; requirePermission
// is any-of, so this only widens who can, and nobody loses a write they had.

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.otherIncomes), OtherIncomeController.getAllOtherIncomes);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:supplier.dashboard", "page:supplier.payments"), validateRequest(createOtherIncomeZodSchema), OtherIncomeController.createOtherIncome);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:supplier.dashboard", "page:supplier.payments"), validateRequest(updateOtherIncomeZodSchema), OtherIncomeController.updateOtherIncome);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, OtherIncomeController.deleteOtherIncome);

export const OtherIncomeRoutes = router;
