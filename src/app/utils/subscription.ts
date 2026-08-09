import { PlanStatus, SubscriptionStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { getCachedOwnerAccess, invalidateOwnerAccess, setCachedOwnerAccess } from "./authCache.js";

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
        const expired = await prisma.ownerSubscription.update({
            where: { owner_id: ownerId },
            data: {
                plan_status: PlanStatus.expired,
                status: SubscriptionStatus.expired,
            },
        });
        invalidateOwnerAccess(ownerId);
        return expired;
    }

    return subscription;
};

// Mirrors the old `has_active_owner_access` Postgres function.
//
// This runs on every workspace request, so the subscription's plan_status and
// expiry are cached for a few seconds. The expiry is compared against the
// clock here rather than stored as a yes/no, so access still ends at the exact
// moment the plan lapses; anything that changes a plan calls
// invalidateOwnerAccess. The lazy "flip it to expired" write is left to
// checkOwnerSubscriptionExpiry and the hourly sweep in app.ts - it does not
// need to happen inside a read that only asks whether access is allowed.
export const hasActiveOwnerAccess = async (ownerId: string): Promise<boolean> => {
    let access = getCachedOwnerAccess(ownerId);

    if (access === undefined) {
        const subscription = await prisma.ownerSubscription.findUnique({
            where: { owner_id: ownerId },
            select: { plan_status: true, expiry_date: true },
        });
        access = subscription
            ? { planStatus: subscription.plan_status, expiryMs: subscription.expiry_date?.getTime() ?? null }
            : null;
        setCachedOwnerAccess(ownerId, access);
    }

    if (!access || access.expiryMs === null) return false;

    return access.planStatus === PlanStatus.active && access.expiryMs > Date.now();
};
