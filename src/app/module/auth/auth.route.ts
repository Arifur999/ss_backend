import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { authAttemptLimiter, authEmailLimiter, registerLimiter, sessionLimiter } from "../../middleware/rateLimit.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AuthController } from "./auth.controller.js";
import { forgotPasswordZodSchema, loginZodSchema, registerOwnerZodSchema, resendOtpZodSchema, resetPasswordZodSchema, verifyOtpZodSchema } from "./auth.validation.js";

const router = Router();

// Every unauthenticated route here is rate limited - see middleware/rateLimit.ts
// for the reasoning and the numbers. The limits sit above normal use, so a
// customer signing in never meets them.
router.post("/register", registerLimiter, validateRequest(registerOwnerZodSchema), AuthController.registerOwner);
router.post("/login", authAttemptLimiter, validateRequest(loginZodSchema), AuthController.loginUser);
// Email OTP verification (step 2 of register / unverified login)
router.post("/verify-otp", authAttemptLimiter, validateRequest(verifyOtpZodSchema), AuthController.verifyOtp);
router.post("/resend-otp", authEmailLimiter, validateRequest(resendOtpZodSchema), AuthController.resendOtp);
// Forgot / reset password (email OTP)
router.post("/forgot-password", authEmailLimiter, validateRequest(forgotPasswordZodSchema), AuthController.forgotPassword);
router.post("/reset-password", authAttemptLimiter, validateRequest(resetPasswordZodSchema), AuthController.resetPassword);
router.get("/me", checkAuth(), AuthController.getMe);
router.post("/refresh-token", sessionLimiter, AuthController.refreshToken);
router.post("/logout", sessionLimiter, AuthController.logoutUser);
router.post("/touch-activity", checkAuth(), AuthController.touchActivity);

export const AuthRoutes = router;
