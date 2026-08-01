import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { NotificationController } from "./notification.controller.js";
import { createNotificationZodSchema } from "./notification.validation.js";

const router = Router();

// Any authenticated user reads their broadcast notifications.
router.get("/my", checkAuth(), NotificationController.getMyNotifications);
router.post("/mark-read", checkAuth(), NotificationController.markAllRead);

// Super admin composes / manages broadcasts.
router.post("/", checkAuth(Role.super_admin), validateRequest(createNotificationZodSchema), NotificationController.createNotification);
router.get("/", checkAuth(Role.super_admin), NotificationController.getAllNotifications);
router.delete("/:id", checkAuth(Role.super_admin), NotificationController.deleteNotification);

export const NotificationRoutes = router;
