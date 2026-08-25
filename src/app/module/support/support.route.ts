import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SupportController } from "./support.controller.js";
import { createTicketZodSchema, replyTicketZodSchema } from "./support.validation.js";

const router = Router();

// A workspace opens and reads its own tickets. Any signed-in member may -
// support is not a permission somebody should have to be granted before they
// can report that the software is broken.
router.post("/", checkAuth(), validateRequest(createTicketZodSchema), SupportController.createTicket);
router.get("/my", checkAuth(), SupportController.getMyTickets);

// The platform's inbox.
router.get("/", checkAuth(Role.super_admin), SupportController.getAllTickets);
router.patch("/:id/solve", checkAuth(Role.super_admin), SupportController.markSolved);

// Both sides write here; the service decides which side the message came from
// and refuses a ticket that is not the caller's.
router.post("/:id/reply", checkAuth(), validateRequest(replyTicketZodSchema), SupportController.replyToTicket);

// A keystroke heartbeat, so the other side can be shown a typing bubble. No
// body, nothing stored in the database - see typingRegistry.
router.post("/:id/typing", checkAuth(), SupportController.noteTyping);

export const SupportRoutes = router;
