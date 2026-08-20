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
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "User-Agent", "X-Requested-With"],
  maxAge: 600,
}));
app.use("*", logger());
app.use("*", requestIdMiddleware());

// BetterAuth Mount
app.all("/api/auth/*", async (c) => {
  const res = await auth.handler(c.req.raw);
  
  // Clone and append CORS headers to the raw response object returned by Better Auth
  const corsHeaders = new Headers(res.headers);
  corsHeaders.set("Access-Control-Allow-Origin", env.CORS_ORIGIN);
  corsHeaders.set("Access-Control-Allow-Credentials", "true");
  corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent, X-Requested-With");
  
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: corsHeaders,
  });
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
