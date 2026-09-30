import "dotenv/config";
import { Role } from "../generated/prisma/enums.js";
import { prisma } from "../app/lib/prisma.js";
import { migratePermissionList, needsMigration } from "../app/shared/legacyPermissionMap.js";

// ---------------------------------------------------------------------------
// Translate every stored permission array from the old action-shaped vocabulary
// into the menu-shaped one.
//
//   "View Sales", "Delete Purchase"  ->  "page:sales.ledger", "act:purchase.delete"
//
// WHY THIS IS NOT OPTIONAL. sanitizePermissions drops any name the build does
// not recognise, and an empty array means "everything the role allows". So on the
// day the legacy tail is removed from PERMISSIONS, every user whose ticks have
// not been translated is silently WIDENED to their full role - no error, no log,
// nothing on screen. A restricted sales_staff would quietly gain the whole app.
//
// The mapping table and its reasoning live in
// src/app/shared/legacyPermissionMap.ts, which is pure and tested. This file is
// only the part that touches the database.
//
// SAFE BY CONSTRUCTION:
//   - the old array is copied to legacy_permissions first, so rolling back is
//     one UPDATE (see the 20260930100000 migration)
//   - rows already holding a page: or act: name are skipped, so a second run
//     changes nothing
//   - an EMPTY array is never touched. Empty means "everything the role allows",
//     and filling it in would take access away from nearly every user in the
//     system rather than giving it
//   - owners and super_admins are never touched. They bypass requirePermission
//     entirely, so their array is decoration
//
// Lives under src/ so `npm run build` compiles it into dist/ and it ships in
// the runtime image. It cannot live in scripts/: tsconfig only includes src, the
// Dockerfile copies only dist + prisma, and tsx is a devDependency that
// `npm ci --omit=dev` leaves out - so a scripts/*.ts file has no interpreter and
// no presence inside the container at all.
//
// Dry run by default. Nothing is written without --apply. On the VPS:
//   docker compose exec backend node dist/scripts/migratePermissions.js
//   docker compose exec backend node dist/scripts/migratePermissions.js --apply
//
// Locally, against whatever DATABASE_URL .env points at:
//   npx tsx src/scripts/migratePermissions.ts
//
// READ THE PRINTED DIFF BEFORE PASSING --apply. It is per user, before and
// after, and it is the only chance to notice a translation nobody wanted.
//
// To roll back:
//   UPDATE users SET permissions = legacy_permissions
//   WHERE cardinality(legacy_permissions) > 0;
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply");

type Candidate = {
    id: string;
    email: string;
    full_name: string;
    role: Role;
    permissions: string[];
    legacy_permissions: string[];
};

const list = (names: readonly string[]) => (names.length === 0 ? "(empty)" : names.join(", "));

async function main() {
    const users: Candidate[] = await prisma.user.findMany({
        where: {
            // Owners and super_admins bypass the permission layer, so their array
            // never decides anything.
            role: { notIn: [Role.owner, Role.super_admin] },
        },
        select: {
            id: true, email: true, full_name: true, role: true,
            permissions: true, legacy_permissions: true,
        },
        orderBy: { created_at: "asc" },
    });

    const empty = users.filter((user) => user.permissions.length === 0);
    const already = users.filter(
        (user) => user.permissions.length > 0 && !needsMigration(user.permissions)
    );
    const todo = users.filter((user) => needsMigration(user.permissions));

    console.log(`Team members (excluding owners and super_admins): ${users.length}`);
    console.log(`  nothing ticked, left alone:  ${empty.length}`);
    console.log(`  already translated, skipped: ${already.length}`);
    console.log(`  to translate:                ${todo.length}`);
    console.log("");

    if (todo.length === 0) {
        console.log(APPLY ? "Nothing to do." : "Nothing to do. No --apply needed.");
        return;
    }

    let widened = 0;
    let narrowed = 0;

    for (const candidate of todo) {
        const before = candidate.permissions;
        const after = migratePermissionList(before);

        console.log(`${candidate.full_name || "(no name)"} <${candidate.email}>  [${candidate.role}]`);
        console.log(`  before (${before.length}): ${list(before)}`);
        console.log(`  after  (${after.length}): ${list(after)}`);

        // Worth saying out loud, because the whole point of the exercise is not
        // to hand anybody more than they had.
        if (after.length === 0) {
            console.log("  !! translates to NOTHING, which means full role access - check this one");
            widened += 1;
        }
        const lostDelete = before.filter((name) => name.startsWith("Delete")).length > 0
            && after.every((name) => !name.startsWith("act:"));
        if (lostDelete) {
            console.log("  .. had a Delete tick that has no equivalent, so it is gone");
            narrowed += 1;
        }
        console.log("");

        if (APPLY) {
            await prisma.user.update({
                where: { id: candidate.id },
                data: {
                    // Only written the first time, so a re-run cannot overwrite the
                    // real original with an already-migrated array.
                    ...(candidate.legacy_permissions.length === 0 ? { legacy_permissions: before } : {}),
                    permissions: after,
                },
            });
        }
    }

    if (widened > 0) {
        console.log(`WARNING: ${widened} user(s) translate to an empty list, which grants their whole role.`);
    }
    if (narrowed > 0) {
        console.log(`Note: ${narrowed} user(s) lost a Delete tick that has no box in the new screen.`);
    }

    if (APPLY) {
        console.log(`Written. ${todo.length} user(s) migrated; old arrays kept in legacy_permissions.`);
        console.log("Permissions are read from the database per request, so this is live immediately.");
    } else {
        console.log("Dry run. Re-run with --apply to write it.");
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
