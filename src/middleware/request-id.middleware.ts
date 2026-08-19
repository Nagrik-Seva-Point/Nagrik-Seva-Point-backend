import type { MiddlewareHandler } from "hono";
import type { ContextVariables } from "../app/context.ts";

export const requestIdMiddleware = (): MiddlewareHandler<ContextVariables> => {
  return async (c, next) => {
    const id = crypto.randomUUID();
    c.set("requestId", id);
    c.header("X-Request-Id", id);
    await next();
  };
};
