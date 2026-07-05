import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { UserController } from "./user.controller.js";
import { createTeamUserZodSchema, deleteTeamUserZodSchema, updateTeamUserZodSchema } from "./user.validation.js";

const router = Router();

// Replaces the old Supabase manage-users edge function (owner-only).
router.get("/list", checkAuth(Role.owner), checkSubscription, UserController.listTeamUsers);
router.post("/create", checkAuth(Role.owner), checkSubscription, validateRequest(createTeamUserZodSchema), UserController.createTeamUser);
router.put("/update", checkAuth(Role.owner), checkSubscription, validateRequest(updateTeamUserZodSchema), UserController.updateTeamUser);
router.delete("/delete", checkAuth(Role.owner), checkSubscription, validateRequest(deleteTeamUserZodSchema), UserController.deleteTeamUser);

export const UserRoutes = router;
