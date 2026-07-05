import z from "zod";

export const registerOwnerZodSchema = z.object({
    fullName: z.string("Full name must be string").min(2, "Full name must be at least 2 characters").max(100, "Full name must be at most 100 characters"),
    businessName: z.string("Business name must be string").min(2, "Business name must be at least 2 characters").max(150, "Business name must be at most 150 characters"),
    phone: z.string("Phone must be string").min(6, "Phone must be at least 6 characters").max(20, "Phone must be at most 20 characters"),
    email: z.email("Email must be a valid email address"),
    password: z.string("Password must be string").min(6, "Password must be at least 6 characters"),
    address: z.string("Address must be string").optional(),
});

export const loginZodSchema = z.object({
    email: z.email("Email must be a valid email address"),
    password: z.string("Password must be string").min(1, "Password is required"),
});
