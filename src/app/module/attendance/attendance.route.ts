import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AttendanceController } from "./attendance.controller.js";
import { upsertAttendanceZodSchema } from "./attendance.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, AttendanceController.getAllAttendance);
router.put("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(upsertAttendanceZodSchema), AttendanceController.upsertAttendance);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, AttendanceController.deleteAttendance);

export const AttendanceRoutes = router;
