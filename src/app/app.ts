import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { CONSTANTS } from "../core/config/constants";
import { errorHandler } from "../core/errors/error-handler";
import { requestIdMiddleware } from "../middleware/request-id.middleware";
import {
  CORS_ALLOW_HEADERS,
  CORS_ALLOW_METHODS,
  getAllowedCorsOrigin,
} from "../core/config/cors";
import { auth } from "../core/auth/better-auth";
import { apiRouter } from "./routes";
import type { ContextVariables } from "./context";

export const app = new Hono<ContextVariables>();

// Global Middleware
app.use(
  "*",
  cors({
    origin: (origin) => getAllowedCorsOrigin(origin),
    credentials: true,
    allowMethods: CORS_ALLOW_METHODS,
    allowHeaders: CORS_ALLOW_HEADERS,
    maxAge: 600,
  }),
);
app.use("*", logger());
app.use("*", requestIdMiddleware());

// BetterAuth Mount
app.all("/api/auth/*", async (c) => {
  const res = await auth.handler(c.req.raw);
  const allowedOrigin = getAllowedCorsOrigin(c.req.header("Origin"));

  // Clone and append CORS headers to the raw response object returned by Better Auth
  const corsHeaders = new Headers(res.headers);
  if (allowedOrigin) {
    corsHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
    corsHeaders.set("Vary", "Origin");
  }
  corsHeaders.set("Access-Control-Allow-Credentials", "true");
  corsHeaders.set(
    "Access-Control-Allow-Methods",
    CORS_ALLOW_METHODS.join(", "),
  );
  corsHeaders.set(
    "Access-Control-Allow-Headers",
    CORS_ALLOW_HEADERS.join(", "),
  );

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: corsHeaders,
  });
});

// API Routes (Prefix: /api/v1)
app.route(CONSTANTS.API_PREFIX, apiRouter);

// Root Service Metadata
app.get("/", (c) => {
  return c.json({
    name: "Nagrik Seva API",
    status: "ok",
    health: "/health",
    version: "1.0.0",
  });
});

// Health Check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  });
});

// Global Error Handling
app.onError(errorHandler);
export type App = typeof app;

