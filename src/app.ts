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

// Sits behind nginx, so the client address arrives in X-Forwarded-For. Without
// this every request looks like it came from the proxy, which would put all
// users in one rate-limit bucket and let a single attacker lock out everybody.
// 1 = trust exactly one proxy hop, which is what the compose stack has.
app.set("trust proxy", 1);

// FRONTEND_URL may be a single origin or a comma-separated list (e.g. both
// the www and bare-domain variants of a site: FRONTEND_URL=
// https://example.com,https://www.example.com).
const staticAllowedOrigins = [
    ...env.FRONTEND_URL.split(",").map((url) => url.trim()).filter(Boolean),
];

// The SPA and the API are served from one origin (nginx proxies /api/ on the
// same host), so in production the browser never makes a cross-origin request
// and nothing beyond the configured origin needs to be allowed.
//
// Development keeps the localhost allowances so `npm run dev` on any Vite port
// still reaches a local backend.
//
// Removed deliberately: `*.hostingersite.com`, which allowed ANY Hostinger
// preview subdomain - free for anyone to register - as a credentialed origin.
// It dated from a period when the frontend ran on a preview URL; that hosting
// is gone. Cookies are SameSite=lax so it was not exploitable on its own, but
// combined with the Bearer-token fallback in checkAuth it was one config change
// away from being a real cross-origin read of every tenant's data.
const isDevelopment = env.NODE_ENV !== "production";

function isAllowedOrigin(origin?: string): boolean {
    // No Origin header: same-origin navigations, curl, server-to-server.
    if (!origin) return true;
    if (staticAllowedOrigins.includes(origin)) return true;
    if (isDevelopment && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
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
