import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { InventoryController } from "./inventory.controller.js";
import { adjustInventoryZodSchema } from "./inventory.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, InventoryController.getAllInventory);
router.get("/history", checkAuth(), checkSubscription, InventoryController.getInventoryHistory);
router.get("/batches", checkAuth(), checkSubscription, InventoryController.getInventoryBatches);
router.post("/adjust", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(adjustInventoryZodSchema), InventoryController.adjustInventory);
router.patch("/dp-price", checkAuth(Role.owner, Role.manager), checkSubscription, InventoryController.setDpPrice);

export const InventoryRoutes = router;
