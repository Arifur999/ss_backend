import z from "zod";
import { Role } from "../../../generated/prisma/enums.js";

// Owners can only create workspace staff roles - never another owner/super admin.
const staffRoles = [Role.manager, Role.sales_staff, Role.accountant] as const;

export const createTeamUserZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
    password: z.string("Password must be string").min(6, "Password must be at least 6 characters"),
    full_name: z.string("Full name must be string").min(1, "Full name is required"),
    role: z.enum(staffRoles, "Role must be one of manager, sales_staff, accountant"),
    phone: z.string("Phone must be string").optional(),
});

export const updateTeamUserZodSchema = z.object({
    user_id: z.uuid("user_id must be a valid UUID"),
    role: z.enum(staffRoles, "Role must be one of manager, sales_staff, accountant").optional(),
    full_name: z.string("Full name must be string").optional(),
    phone: z.string("Phone must be string").optional(),
    is_active: z.boolean("is_active must be a boolean").optional(),
    password: z.string("Password must be string").min(6, "Password must be at least 6 characters").optional(),
});

export const deleteTeamUserZodSchema = z.object({
    user_id: z.uuid("user_id must be a valid UUID"),
});

export type ICreateTeamUserPayload = z.infer<typeof createTeamUserZodSchema>;
export type IUpdateTeamUserPayload = z.infer<typeof updateTeamUserZodSchema>;
