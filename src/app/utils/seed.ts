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

    const hashedPassword = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);

    await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            full_name: "Super Admin",
            role: Role.super_admin,
            is_active: true,
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
