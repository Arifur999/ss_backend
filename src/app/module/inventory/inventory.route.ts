import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { InventoryController } from "./inventory.controller.js";
import { adjustInventoryZodSchema, setDpPriceZodSchema } from "./inventory.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, InventoryController.getAllInventory);
// Paged stock list with every quantity computed in SQL - see the service.
router.get("/list", checkAuth(), checkSubscription, InventoryController.getInventoryList);
router.get("/history", checkAuth(), checkSubscription, InventoryController.getInventoryHistory);
router.get("/batches", checkAuth(), checkSubscription, InventoryController.getInventoryBatches);
router.post("/adjust", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(adjustInventoryZodSchema), InventoryController.adjustInventory);
router.patch("/dp-price", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(setDpPriceZodSchema), InventoryController.setDpPrice);

export const InventoryRoutes = router;
