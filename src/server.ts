import { Server } from "http";
import app from "./app.js";
import { seedSuperAdmin } from "./app/utils/seed.js";
import { mailProviderSummary } from "./app/utils/email.js";
import { env } from "./config/env.js";

let server: Server;

const bootstrap = async () => {
    try {
        await seedSuperAdmin();
        server = app.listen(env.PORT, () => {
            console.log(`Server is running on http://localhost:${env.PORT}`);
            // Which mail credentials won the resolution order in utils/email.ts.
            // Changing the sender is an env change with no visible confirmation
            // anywhere else, and the wrong one fails silently.
            console.log(`[mail] ${mailProviderSummary()}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
    }
};

process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Shutting down server...");
    if (server) {
        server.close(() => {
            console.log("Server closed gracefully.");
            process.exit(1);
        });
    }
    process.exit(1);
});

process.on("SIGINT", () => {
    console.log("SIGINT signal received. Shutting down server...");
    if (server) {
        server.close(() => {
            console.log("Server closed gracefully.");
            process.exit(1);
        });
    }
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.log("Uncaught Exception Detected... Shutting down server", error);
    if (server) {
        server.close(() => {
            process.exit(1);
        });
    }
    process.exit(1);
});

process.on("unhandledRejection", (error) => {
    console.log("Unhandled Rejection Detected... Shutting down server", error);
    if (server) {
        server.close(() => {
            process.exit(1);
        });
    }
    process.exit(1);
});

bootstrap();
