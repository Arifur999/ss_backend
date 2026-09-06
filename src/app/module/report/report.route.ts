import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ReportController } from "./report.controller.js";
import { emailReportZodSchema } from "./report.validation.js";

const router = Router();

// Same gate as reading a report: anybody who may look at these figures may mail
// them to the owner, and the owner is the only address they can reach.
router.post(
    "/email",
    checkAuth(Role.owner, Role.manager, Role.accountant),
    checkSubscription,
    requirePermission("View Reports"),
    validateRequest(emailReportZodSchema),
    ReportController.emailReport
);

export const ReportRoutes = router;
