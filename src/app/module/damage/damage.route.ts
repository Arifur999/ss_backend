import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { DamageController } from "./damage.controller.js";
import {
    createDamageZodSchema,
    receiveDamageItemZodSchema,
    updateDamageZodSchema,
} from "./damage.validation.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission("View Damage"), DamageController.getAllDamageEntries);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Add Damage"), validateRequest(createDamageZodSchema), DamageController.createDamageEntry);
// Declared before "/:id" so the static segment is not swallowed by it.
router.post("/:id/receive", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Receive Damage"), validateRequest(receiveDamageItemZodSchema), DamageController.receiveDamageItem);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Edit Damage"), validateRequest(updateDamageZodSchema), DamageController.updateDamageEntry);
// No validateRequest: the body carries only the optional recycle-bin metadata.
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Delete Damage"), DamageController.deleteDamageEntry);

export const DamageRoutes = router;
