import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import cron from "node-cron";
import { prisma } from "./app/lib/prisma.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import notFound from "./app/middleware/notFound.js";
import { indexRoute } from "./app/routes/index.js";
import { sendExpiryReminders } from "./app/utils/subscriptionReminders.js";
import { env } from "./config/env.js";

const app: Application = express();

// Hourly: flip active subscriptions past their expiry date to expired
// (replaces the lazy check_owner_subscription_expiry RPC with a sweep).
cron.schedule("0 * * * *", async () => {
    try {
        const result = await prisma.ownerSubscription.updateMany({
            where: {
                plan_status: "active",
                expiry_date: { lt: new Date() },
            },
            data: {
                plan_status: "expired",
                status: "expired",
            },
        });
        if (result.count > 0) {
            console.log(`Subscription sweep: marked ${result.count} subscription(s) as expired`);
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Subscription expiry sweep failed:", error.message);
    }
});

// Daily at 9am: email owners whose subscription expires in exactly 15, 7 or
// 3 days, using the super-admin editable template (see platformSettings
// module). sendExpiryReminders() dedupes internally via ReminderLog.
cron.schedule("0 9 * * *", async () => {
    try {
        await sendExpiryReminders();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Expiry reminder cron failed:", error.message);
    }
});

// FRONTEND_URL may be a single origin or a comma-separated list (e.g. both
// the www and bare-domain variants of a shared-hosting site: FRONTEND_URL=
// https://example.com,https://www.example.com). Frontend and backend now
// commonly live on entirely different hosts/domains (Railway + Hostinger),
// so this can no longer assume same-origin like the nginx-proxied setup did.
const staticAllowedOrigins = [
    ...env.FRONTEND_URL.split(",").map((url) => url.trim()).filter(Boolean),
    "http://localhost:5173",
    "http://localhost:3000",
];

// Besides the explicitly configured origins we also allow:
//  (a) any localhost / 127.0.0.1 port during development (5174, 4173, ...), and
//  (b) Hostinger preview subdomains (*.hostingersite.com) - the site is served
//      from a temporary preview URL (e.g. purple-otter-123.hostingersite.com)
//      until the real domain (cosmeticdentalbranding.com) is attached.
// Requests with no Origin header (curl, server-to-server, same-origin) pass.
function isAllowedOrigin(origin?: string): boolean {
    if (!origin) return true;
    if (staticAllowedOrigins.includes(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.hostingersite\.com$/i.test(origin)) return true;
    return false;
}

app.use(cors({
    origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/v1", indexRoute);

app.get("/", async (req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: "Furniture Business Management API is working",
    });
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
