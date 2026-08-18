import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { RecycleBinController } from "./recycleBin.controller.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission("Recycle Bin"), RecycleBinController.getRecycleItems);
router.post("/:id/restore", checkAuth(Role.owner, Role.manager), checkSubscription, RecycleBinController.restoreItem);
router.delete("/empty", checkAuth(Role.owner), checkSubscription, RecycleBinController.emptyRecycleBin);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, RecycleBinController.deleteItemPermanently);

export const RecycleBinRoutes = router;
