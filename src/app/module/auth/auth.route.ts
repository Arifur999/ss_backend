import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AuthController } from "./auth.controller.js";
import { loginZodSchema, registerOwnerZodSchema } from "./auth.validation.js";

const router = Router();

router.post("/register", validateRequest(registerOwnerZodSchema), AuthController.registerOwner);
router.post("/login", validateRequest(loginZodSchema), AuthController.loginUser);
router.get("/me", checkAuth(), AuthController.getMe);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logoutUser);
router.post("/touch-activity", checkAuth(), AuthController.touchActivity);

export const AuthRoutes = router;
