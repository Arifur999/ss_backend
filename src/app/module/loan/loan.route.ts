import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { LoanController } from "./loan.controller.js";
import { createLoanZodSchema, updateLoanZodSchema } from "./loan.validation.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, LoanController.getAllLoans);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createLoanZodSchema), LoanController.createLoan);
router.patch("/:id", checkAuth(Role.owner), checkSubscription, validateRequest(updateLoanZodSchema), LoanController.updateLoan);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, LoanController.deleteLoan);

export const LoanRoutes = router;
