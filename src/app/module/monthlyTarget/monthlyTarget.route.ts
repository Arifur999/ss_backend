import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { MonthlyTargetController } from "./monthlyTarget.controller.js";
import { upsertMonthlyTargetZodSchema } from "./monthlyTarget.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, MonthlyTargetController.getAllTargets);
router.put("/", checkAuth(Role.owner), checkSubscription, validateRequest(upsertMonthlyTargetZodSchema), MonthlyTargetController.upsertTarget);
router.patch("/:id", checkAuth(Role.owner), checkSubscription, MonthlyTargetController.updateTargetById);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, MonthlyTargetController.deleteTarget);

export const MonthlyTargetRoutes = router;
