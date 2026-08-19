import type { Context } from "hono";
import { AppError } from "./AppError.ts";
import { logger } from "../logger/logger.ts";

export const errorHandler = (err: Error, c: Context) => {
  const requestId = c.get("requestId") || "unknown";

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      },
      err.statusCode as any,
    );
  }

  // Handle default runtime errors (Sanitized response)
  logger.error(`[Unhandled Error] RequestID: ${requestId} - Error:`, err);

  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    },
    500,
  );
};
