import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import notFound from "./app/middleware/notFound.js";
import { indexRoute } from "./app/routes/index.js";
import { env } from "./config/env.js";

const app: Application = express();

app.use(cors({
    origin: [env.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
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
