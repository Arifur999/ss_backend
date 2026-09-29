import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { LeadController } from "./lead.controller.js";
import { createLeadZodSchema, updateLeadZodSchema } from "./lead.validation.js";

const router = Router();

// Gated the same way marketing contacts are: anyone signed in may read the
// list, and the three roles that run campaigns may change it.
router.get("/", checkAuth(), checkSubscription, LeadController.getAllLeads);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, validateRequest(createLeadZodSchema), LeadController.createLead);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, validateRequest(updateLeadZodSchema), LeadController.updateLead);
router.delete("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, LeadController.deleteLead);

export const LeadRoutes = router;
