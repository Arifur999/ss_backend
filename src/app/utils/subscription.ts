import { PlanStatus, SubscriptionStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

// Mirrors the old `check_owner_subscription_expiry` Postgres function:
// lazily flips an active subscription to expired once its expiry date passes,
// then returns the (possibly updated) subscription row.
export const checkOwnerSubscriptionExpiry = async (ownerId: string) => {
    const subscription = await prisma.ownerSubscription.findUnique({
        where: { owner_id: ownerId },
    });

    if (!subscription) return null;

    if (
        subscription.plan_status === PlanStatus.active &&
        subscription.expiry_date &&
        subscription.expiry_date.getTime() < Date.now()
    ) {
        return prisma.ownerSubscription.update({
            where: { owner_id: ownerId },
            data: {
                plan_status: PlanStatus.expired,
                status: SubscriptionStatus.expired,
            },
        });
    }

    return subscription;
};

// Mirrors the old `has_active_owner_access` Postgres function.
export const hasActiveOwnerAccess = async (ownerId: string): Promise<boolean> => {
    const subscription = await checkOwnerSubscriptionExpiry(ownerId);
    if (!subscription) return false;

    return (
        subscription.plan_status === PlanStatus.active &&
        subscription.expiry_date.getTime() > Date.now()
    );
};
