import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AttendanceController } from "./attendance.controller.js";
import { updateAttendanceZodSchema, upsertAttendanceZodSchema } from "./attendance.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission("page:employees.attendance"), AttendanceController.getAllAttendance);
router.put("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:employees.attendance"), validateRequest(upsertAttendanceZodSchema), AttendanceController.upsertAttendance);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:employees.attendance"), validateRequest(updateAttendanceZodSchema), AttendanceController.updateAttendance);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:employees.delete"), AttendanceController.deleteAttendance);

export const AttendanceRoutes = router;
