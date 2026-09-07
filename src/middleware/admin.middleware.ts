import type { Context, MiddlewareHandler } from "hono";
import type { ContextVariables } from "../app/context";
import { AppError } from "../core/errors/AppError";

export const requireAdmin = (): MiddlewareHandler<ContextVariables> => {
  return async (c: Context<ContextVariables>, next) => {
    const user = c.get("user") as { role?: string } | null | undefined;

    if (!user) {
      throw AppError.unauthorized("Authentication required", "AUTH_REQUIRED");
    }

    const role = typeof user.role === "string"
      ? user.role.toUpperCase()
      : user.role;

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw AppError.forbidden(
        "Access denied: Administrator privileges required",
        "ADMIN_REQUIRED",
      );
    }

    // Role-Based Access Control (RBAC):
    // ADMIN has view/read-only access.
    // Only SUPER_ADMIN can create, update, or delete administrative resources.
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      if (role !== "SUPER_ADMIN") {
        throw AppError.forbidden(
          "Access denied: Super Administrator privileges required to create, update, or delete resources in the Admin dashboard.",
          "SUPER_ADMIN_REQUIRED",
        );
      }
    }

    await next();
  };
};

export const requireSuperAdmin = (): MiddlewareHandler<ContextVariables> => {
  return async (c: Context<ContextVariables>, next) => {
    const user = c.get("user") as { role?: string } | null | undefined;

    if (!user) {
      throw AppError.unauthorized("Authentication required", "AUTH_REQUIRED");
    }

    const role = typeof user.role === "string"
      ? user.role.toUpperCase()
      : user.role;

    if (role !== "SUPER_ADMIN") {
      throw AppError.forbidden(
        "Access denied: Super Administrator privileges required.",
        "SUPER_ADMIN_REQUIRED",
      );
    }

    await next();
  };
};
