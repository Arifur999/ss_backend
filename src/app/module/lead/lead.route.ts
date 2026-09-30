import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { LeadController } from "./lead.controller.js";
import { createLeadZodSchema, updateLeadZodSchema } from "./lead.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const router = Router();

// Gated the same way marketing contacts are: anyone signed in may read the
// list, and the three roles that run campaigns may change it.
router.get("/", checkAuth(), checkSubscription, requirePermission("page:marketing.campaign"), LeadController.getAllLeads);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:marketing.campaign"), validateRequest(createLeadZodSchema), LeadController.createLead);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("page:marketing.campaign"), validateRequest(updateLeadZodSchema), LeadController.updateLead);
router.delete("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("act:marketing.delete"), LeadController.deleteLead);

export const LeadRoutes = router;
