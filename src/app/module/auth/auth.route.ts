import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AuthController } from "./auth.controller.js";
import { forgotPasswordZodSchema, loginZodSchema, registerOwnerZodSchema, resendOtpZodSchema, resetPasswordZodSchema, verifyOtpZodSchema } from "./auth.validation.js";

const router = Router();

router.post("/register", validateRequest(registerOwnerZodSchema), AuthController.registerOwner);
router.post("/login", validateRequest(loginZodSchema), AuthController.loginUser);
// Email OTP verification (step 2 of register / unverified login)
router.post("/verify-otp", validateRequest(verifyOtpZodSchema), AuthController.verifyOtp);
router.post("/resend-otp", validateRequest(resendOtpZodSchema), AuthController.resendOtp);
// Forgot / reset password (email OTP)
router.post("/forgot-password", validateRequest(forgotPasswordZodSchema), AuthController.forgotPassword);
router.post("/reset-password", validateRequest(resetPasswordZodSchema), AuthController.resetPassword);
router.get("/me", checkAuth(), AuthController.getMe);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logoutUser);
router.post("/touch-activity", checkAuth(), AuthController.touchActivity);

export const AuthRoutes = router;
