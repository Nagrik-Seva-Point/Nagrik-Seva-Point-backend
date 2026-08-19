import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { CONSTANTS } from "../core/config/constants.ts";
import { errorHandler } from "../core/errors/error-handler.ts";
import { requestIdMiddleware } from "../middleware/request-id.middleware.ts";
import { env } from "../core/config/env.ts";
import { auth } from "../core/auth/better-auth.ts";
import { apiRouter } from "./routes.ts";
import type { ContextVariables } from "./context.ts";

export const app = new Hono<ContextVariables>();

// Global Middleware
app.use("*", cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use("*", logger());
app.use("*", requestIdMiddleware());

// BetterAuth Mount
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// API Routes (Prefix: /api/v1)
app.route(CONSTANTS.API_PREFIX, apiRouter);

// Health Check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  });
});

// Error Handling
app.onError(errorHandler);
export type App = typeof app;
