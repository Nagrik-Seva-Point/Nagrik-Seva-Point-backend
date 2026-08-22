import type { Context, MiddlewareHandler } from "hono";
import type { ContextVariables } from "../app/context.ts";
import { AppError } from "../core/errors/AppError.ts";

export const requireAdmin = (): MiddlewareHandler<ContextVariables> => {
  return async (c: Context<ContextVariables>, next) => {
    const user = c.get("user") as any;

    if (!user) {
      throw AppError.unauthorized("Authentication required", "AUTH_REQUIRED");
    }

    const role =
      typeof user.role === "string" ? user.role.toUpperCase() : user.role;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw AppError.forbidden(
        "Access denied: Administrator privileges required",
        "ADMIN_REQUIRED",
      );
    }

    await next();
  };
};
