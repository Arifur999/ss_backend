import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

export const seedSuperAdmin = async () => {
    const email = env.SUPER_ADMIN_EMAIL.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        if (existing.role !== Role.super_admin) {
            await prisma.user.update({
                where: { email },
                data: { role: Role.super_admin, is_active: true },
            });
            console.log("Existing user promoted to super admin:", email);
        }
        return;
    }

    // Nobody holds the configured address yet. If there is already exactly one
    // super admin, this is an address change (e.g. moving off a placeholder
    // inbox), so move that account over rather than leaving a stray second
    // super admin behind. The password hash is untouched - the existing
    // password keeps working. With more than one, the intent is ambiguous, so
    // fall through and create a fresh account instead.
    const superAdmins = await prisma.user.findMany({
        where: { role: Role.super_admin },
        orderBy: { created_at: "asc" },
    });

    if (superAdmins.length === 1) {
        const current = superAdmins[0];
        await prisma.user.update({
            where: { id: current.id },
            data: { email, email_verified: true, is_active: true },
        });
        console.log(`Super admin email changed: ${current.email} -> ${email} (password unchanged)`);
        return;
    }

    const hashedPassword = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);

    await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            full_name: "Super Admin",
            role: Role.super_admin,
            is_active: true,
            // The seeded super admin never goes through the OTP flow.
            email_verified: true,
        },
    });

    console.log("Super admin seeded:", email);
};

// Allow running directly: npm run seed
if (process.argv[1] && process.argv[1].includes("seed")) {
    seedSuperAdmin()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Seeding failed:", error);
            process.exit(1);
        });
}
