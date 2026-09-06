import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { DraftController } from "./draft.controller.js";
import { saveDraftZodSchema } from "./draft.validation.js";

const router = Router();

// Anyone who can write an order or an invoice can park one.
const draftRoles = [Role.owner, Role.manager, Role.sales_staff] as const;

// No requirePermission here, deliberately. A draft grants nothing: publishing
// one still goes through POST /purchases or POST /sales, which keep their
// "Add Purchase" and "New Sale" gates. Gating the scratchpad as well would only
// stop somebody saving work they are already allowed to type.
router.get("/", checkAuth(), checkSubscription, DraftController.listDrafts);
router.get("/:id", checkAuth(), checkSubscription, DraftController.getDraft);
router.post("/", checkAuth(...draftRoles), checkSubscription, validateRequest(saveDraftZodSchema), DraftController.saveDraft);
router.patch("/:id", checkAuth(...draftRoles), checkSubscription, validateRequest(saveDraftZodSchema), DraftController.updateDraft);
router.delete("/:id", checkAuth(...draftRoles), checkSubscription, DraftController.deleteDraft);

export const DraftRoutes = router;
