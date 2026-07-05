import status from "http-status";
import { Prisma } from "../../generated/prisma/client.js";
import { ISimplifiedError } from "../interfaces/error.interfaces.js";

export const handlePrismaClientKnownRequestError = (
    error: Prisma.PrismaClientKnownRequestError
): ISimplifiedError => {
    let message = "Database request failed";
    let statusCode: number = status.BAD_REQUEST;

    switch (error.code) {
        case "P2002": {
            const target = Array.isArray(error.meta?.target)
                ? (error.meta?.target as string[]).join(", ")
                : String(error.meta?.target || "field");
            message = `Duplicate value for unique field: ${target}`;
            statusCode = status.CONFLICT;
            break;
        }
        case "P2003":
            message = "This record is linked with other records, operation not allowed";
            statusCode = status.CONFLICT;
            break;
        case "P2025":
            message = (error.meta?.cause as string) || "Record not found";
            statusCode = status.NOT_FOUND;
            break;
        default:
            message = error.message;
            break;
    }

    return {
        statusCode,
        message,
        errorSource: [{ path: "", message }],
    };
};

export const handlePrismaClientUnknownError = (
    error: Prisma.PrismaClientUnknownRequestError
): ISimplifiedError => ({
    statusCode: status.INTERNAL_SERVER_ERROR,
    message: error.message || "Unknown database error",
    errorSource: [{ path: "", message: error.message || "Unknown database error" }],
});

export const handlePrismaClientValidationError = (): ISimplifiedError => ({
    statusCode: status.BAD_REQUEST,
    message: "Invalid data sent to database",
    errorSource: [{ path: "", message: "Invalid data sent to database" }],
});

export const handlePrismaClientInitializationError = (): ISimplifiedError => ({
    statusCode: status.INTERNAL_SERVER_ERROR,
    message: "Failed to connect to database",
    errorSource: [{ path: "", message: "Failed to connect to database" }],
});

export const handlePrismaClientRustPanicError = (): ISimplifiedError => ({
    statusCode: status.INTERNAL_SERVER_ERROR,
    message: "Database engine crashed",
    errorSource: [{ path: "", message: "Database engine crashed" }],
});
