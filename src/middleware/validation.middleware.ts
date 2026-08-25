import type { MiddlewareHandler } from "hono";
import type { ZodSchema } from "zod";
import { AppError } from "../core/errors/AppError";

export const validationMiddleware = (
  schema: ZodSchema,
  target: "json" | "query" = "json",
): MiddlewareHandler => {
  return async (c, next) => {
    let data: unknown;
    try {
      if (target === "json") {
        data = await c.req.json();
      } else {
        data = c.req.query();
      }
    } catch {
      throw AppError.badRequest("Invalid request format");
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw AppError.badRequest(
        "Validation failed",
        "VALIDATION_FAILED",
        result.error.format(),
      );
    }

    c.set("validData", result.data);
    await next();
  };
};
