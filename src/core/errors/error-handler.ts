import type { Context } from "hono";
import type { ContextVariables } from "../../app/context.ts";
import { AppError } from "./AppError.ts";
import { logger } from "../logger/logger.ts";

type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 500;

export const errorHandler = (err: Error, c: Context<ContextVariables>) => {
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
      err.statusCode as ErrorStatusCode,
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
