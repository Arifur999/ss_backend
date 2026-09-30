import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AccountController } from "./account.controller.js";
import { createAccountZodSchema, updateAccountZodSchema } from "./account.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.accounts), AccountController.getAllAccounts);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:balance.overview"), validateRequest(createAccountZodSchema), AccountController.createAccount);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:balance.overview"), validateRequest(updateAccountZodSchema), AccountController.updateAccount);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, AccountController.deleteAccount);

export const AccountRoutes = router;
