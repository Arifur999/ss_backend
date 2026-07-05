import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AccountController } from "./account.controller.js";
import { createAccountZodSchema, updateAccountZodSchema } from "./account.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, AccountController.getAllAccounts);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createAccountZodSchema), AccountController.createAccount);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateAccountZodSchema), AccountController.updateAccount);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, AccountController.deleteAccount);

export const AccountRoutes = router;
