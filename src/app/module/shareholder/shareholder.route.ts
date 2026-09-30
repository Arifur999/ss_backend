import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ShareholderController } from "./shareholder.controller.js";
import { createShareholderZodSchema, updateShareholderZodSchema } from "./shareholder.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.shareholders), ShareholderController.getAllShareholders);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:shareholders.list"), validateRequest(createShareholderZodSchema), ShareholderController.createShareholder);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:shareholders.list"), validateRequest(updateShareholderZodSchema), ShareholderController.updateShareholder);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, ShareholderController.deleteShareholder);

export const ShareholderRoutes = router;
