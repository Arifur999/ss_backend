import dotenv from "dotenv";

dotenv.config();

interface ENVConfig {
    NODE_ENV: string;
    PORT: string | number;
    DATABASE_URL: string;
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    ACCESS_TOKEN_EXPIRES_IN: string;
    REFRESH_TOKEN_EXPIRES_IN: string;
    FRONTEND_URL: string;
    SUPER_ADMIN_EMAIL: string;
    SUPER_ADMIN_PASSWORD: string;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
    BKASH: {
        MODE: "sandbox" | "production";
        BASE_URL: string;
        APP_KEY: string;
        APP_SECRET: string;
        USERNAME: string;
        PASSWORD: string;
        CALLBACK_URL: string;
    };
}

const requiredEnvVars = [
    "DATABASE_URL",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
    "SUPER_ADMIN_EMAIL",
    "SUPER_ADMIN_PASSWORD",
];

requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        throw new Error(`Environment variable ${varName} is not set`);
    }
});

export const env: ENVConfig = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || 5000,
    DATABASE_URL: process.env.DATABASE_URL as string,
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET as string,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET as string,
    ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL as string,
    SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD as string,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
    // bKash credentials resolve by mode so the payment module never has to
    // care whether it's talking to sandbox or production.
    BKASH: (() => {
        const mode = process.env.BKASH_MODE === "production" ? "production" : "sandbox";
        const prefix = mode === "production" ? "BKASH_PROD" : "BKASH_SANDBOX";
        return {
            MODE: mode as "sandbox" | "production",
            BASE_URL:
                process.env[`${prefix}_BASE_URL`] ||
                (mode === "production"
                    ? "https://tokenized.pay.bka.sh/v1.2.0-beta"
                    : "https://tokenized.sandbox.bka.sh/v1.2.0-beta"),
            APP_KEY: process.env[`${prefix}_APP_KEY`] || "",
            APP_SECRET: process.env[`${prefix}_APP_SECRET`] || "",
            USERNAME: process.env[`${prefix}_USERNAME`] || "",
            PASSWORD: process.env[`${prefix}_PASSWORD`] || "",
            CALLBACK_URL: process.env.BKASH_CALLBACK_URL || "http://localhost:5000/api/v1/payments/bkash/callback",
        };
    })(),
};
