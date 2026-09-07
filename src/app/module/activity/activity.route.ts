import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { ActivityController } from "./activity.controller.js";

const router = Router();

// Read-only, and it shows nothing a signed-in user could not reach by opening
// the eight pages it draws from - so no extra permission beyond being in the
// workspace. Every query inside is scoped to the caller's owner_id.
router.get("/day", checkAuth(), checkSubscription, ActivityController.getDayActivity);

export const ActivityRoutes = router;
