import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AccountTransferController } from "./accountTransfer.controller.js";
import { createAccountTransferZodSchema, updateAccountTransferZodSchema } from "./accountTransfer.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.accountTransfers), AccountTransferController.getAllTransfers);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:balance.transfer"), validateRequest(createAccountTransferZodSchema), AccountTransferController.createTransfer);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:balance.transfer"), validateRequest(updateAccountTransferZodSchema), AccountTransferController.updateTransfer);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, AccountTransferController.deleteTransfer);

export const AccountTransferRoutes = router;
