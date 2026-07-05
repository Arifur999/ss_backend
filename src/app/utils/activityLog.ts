import { prisma } from "../lib/prisma.js";

// Feeds the Super Admin "Activity" page with real events
// (owner registered, approved, blocked, plan changed, payment recorded...).
export const logAdminActivity = async (input: {
    ownerId?: string | null;
    actorEmail?: string;
    action: string;
    detail?: string;
}) => {
    try {
        await prisma.adminActivity.create({
            data: {
                owner_id: input.ownerId ?? null,
                actor_email: input.actorEmail ?? "",
                action: input.action,
                detail: input.detail ?? "",
            },
        });
    } catch (error) {
        // Activity logging must never break the main flow.
        console.error("Failed to log admin activity:", error);
    }
};
