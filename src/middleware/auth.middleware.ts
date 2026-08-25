import { auth } from "../core/auth/better-auth";
import { AppError } from "../core/errors/AppError";
import type { MiddlewareHandler } from "hono";
import type { ContextVariables } from "../app/context";

export const authMiddleware = (): MiddlewareHandler<ContextVariables> => {
  return async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      throw AppError.unauthorized("Authentication required");
    }

    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
};
