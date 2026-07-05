import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AccountTransferController } from "./accountTransfer.controller.js";
import { createAccountTransferZodSchema } from "./accountTransfer.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, AccountTransferController.getAllTransfers);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createAccountTransferZodSchema), AccountTransferController.createTransfer);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, AccountTransferController.deleteTransfer);

export const AccountTransferRoutes = router;
