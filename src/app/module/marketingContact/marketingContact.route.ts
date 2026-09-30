import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { MarketingContactController } from "./marketingContact.controller.js";
import {
    createMarketingContactZodSchema,
    updateMarketingContactZodSchema,
} from "./marketingContact.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.marketing), MarketingContactController.getAllContacts);
router.post("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.marketing), validateRequest(createMarketingContactZodSchema), MarketingContactController.createContact);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.marketing), validateRequest(updateMarketingContactZodSchema), MarketingContactController.updateContact);
router.delete("/:id", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("act:marketing.delete"), MarketingContactController.deleteContact);

export const MarketingContactRoutes = router;
