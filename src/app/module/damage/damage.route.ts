import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { DamageController } from "./damage.controller.js";
import {
    createDamageZodSchema,
    damageTransactionZodSchema,
    receiveDamageItemZodSchema,
    updateDamageZodSchema,
} from "./damage.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.damage), DamageController.getAllDamageEntries);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:damage.entries"), validateRequest(createDamageZodSchema), DamageController.createDamageEntry);
// Both declared before "/:id" so the static segments are not swallowed by it.
router.get("/transactions", checkAuth(Role.owner, Role.manager, Role.accountant), checkSubscription, requirePermission(...READS.damage), DamageController.getDamageTransactions);
router.post("/:id/transactions", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:damage.transactions"), validateRequest(damageTransactionZodSchema), DamageController.addDamageTransaction);
router.post("/:id/receive", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:damage.receive"), validateRequest(receiveDamageItemZodSchema), DamageController.receiveDamageItem);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:damage.entries"), validateRequest(updateDamageZodSchema), DamageController.updateDamageEntry);
// No validateRequest: the body carries only the optional recycle-bin metadata.
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:damage.delete"), DamageController.deleteDamageEntry);

export const DamageRoutes = router;
