// Short-lived cache for the two lookups every authenticated request performs:
// who the caller is (checkAuth) and whether their workspace is still paid for
// (checkSubscription). Both are primary-key reads, individually cheap, but they
// run on EVERY request - a page firing ten API calls paid twenty round trips
// before touching any business data.
//
// The window is deliberately small. What makes it safe is that the two risky
// dimensions are handled without relying on it:
//
//   - Access expiry is not cached as a yes/no. The expiry timestamp is cached
//     and compared against the clock on every call, so a subscription still
//     stops working the exact second it lapses.
//   - Everything else (deactivating a user, changing a role, approving a
//     payment) calls the invalidate* helpers below, so it takes effect at once
//     rather than when the entry ages out.
//
// The TTL only covers the case where something changed the database directly,
// without going through this app.

import type { Role } from "../../generated/prisma/enums.js";

const TTL_MS = 15_000;

// Plenty for a single VPS. If it is ever exceeded the whole map is dropped
// rather than evicted one by one: this is a cache, and rebuilding an entry is
// one indexed read.
const MAX_ENTRIES = 5_000;

type Entry<T> = { value: T; at: number };

class TtlCache<T> {
    private store = new Map<string, Entry<T>>();

    get(key: string): T | undefined {
        const hit = this.store.get(key);
        if (!hit) return undefined;
        if (Date.now() - hit.at >= TTL_MS) {
            this.store.delete(key);
            return undefined;
        }
        return hit.value;
    }

    set(key: string, value: T): void {
        if (this.store.size >= MAX_ENTRIES) this.store.clear();
        this.store.set(key, { value, at: Date.now() });
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

// What checkAuth needs to build req.user, and nothing else - the full row it
// used to read includes the bcrypt password hash.
export interface CachedAuthUser {
    id: string;
    email: string;
    full_name: string;
    role: Role;
    phone: string;
    owner_id: string | null;
    is_active: boolean;
    email_verified: boolean;
}

// The subscription facts access is decided from. plan_status is a snapshot;
// expiry_date is compared against the clock at call time, never cached as a
// verdict.
export interface CachedOwnerAccess {
    planStatus: string;
    expiryMs: number | null;
}

const userCache = new TtlCache<CachedAuthUser | null>();
const accessCache = new TtlCache<CachedOwnerAccess | null>();

export const getCachedUser = (userId: string) => userCache.get(userId);
export const setCachedUser = (userId: string, user: CachedAuthUser | null) => userCache.set(userId, user);

export const getCachedOwnerAccess = (ownerId: string) => accessCache.get(ownerId);
export const setCachedOwnerAccess = (ownerId: string, access: CachedOwnerAccess | null) =>
    accessCache.set(ownerId, access);

/** Call after anything that changes a user's identity, role or active state. */
export const invalidateUser = (userId: string) => userCache.delete(userId);

/** Call after anything that changes a workspace's plan or expiry. */
export const invalidateOwnerAccess = (ownerId: string) => accessCache.delete(ownerId);

/** Belt and braces for bulk operations (data resets, owner deletion). */
export const invalidateAuthCaches = () => {
    userCache.clear();
    accessCache.clear();
};
