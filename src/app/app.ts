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
import { env } from "../core/config/env";
import { prisma } from "../core/db/prisma";
import { logApiExecution } from "../core/logger/api-logger";
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

// Redirect /api/auth/error directly to frontend /auth/login
app.get("/api/auth/error", (c) => {
  const origin = env.CORS_ORIGIN[0] || "http://localhost:3000";
  const error = c.req.query("error") || "signup_disabled";
  return c.redirect(`${origin}/auth/login?error=${encodeURIComponent(error)}`);
});

// BetterAuth Mount
app.all("/api/auth/*", async (c) => {
  const isSignOut = c.req.path.includes("/sign-out");
  const isSignIn = c.req.path.includes("/sign-in") || c.req.path.includes("/callback");
  const isSignUp = c.req.path.includes("/sign-up");

  let signingOutSession: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  let reqEmail = "";

  // 1. Capture signing-out user before session is purged from DB
  if (isSignOut) {
    try {
      signingOutSession = await auth.api.getSession({
        headers: c.req.raw.headers,
      }).catch(() => null);

      if (!signingOutSession?.user) {
        const cookieHeader = c.req.header("cookie") || "";
        const authHeader = c.req.header("authorization") || "";
        let token = "";
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.slice(7).trim();
        } else {
          const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/) ||
                        cookieHeader.match(/better-auth=([^;]+)/);
          if (match) token = decodeURIComponent(match[1]).split(".")[0];
        }

        if (token) {
          const sessionRecord = await prisma.session.findFirst({
            where: {
              OR: [
                { token },
                { token: { startsWith: token } },
              ],
            },
            include: { user: true },
          });
          if (sessionRecord) {
            signingOutSession = { session: sessionRecord, user: sessionRecord.user };
          }
        }
      }
    } catch {
      signingOutSession = null;
    }
  }

  // 2. Capture attempt email for sign-in/sign-up
  if (isSignIn || isSignUp) {
    try {
      const clonedReq = c.req.raw.clone();
      const body = await clonedReq.json().catch(() => ({}));
      if (body?.email) reqEmail = String(body.email).trim().toLowerCase();
    } catch {
      // non-blocking
    }
  }

  // Execute Better Auth Handler
  const res = await auth.handler(c.req.raw);

  // 3. Log Sign-Out (Session Terminated)
  if (isSignOut && signingOutSession?.user) {
    try {
      const user = signingOutSession.user;
      const session = signingOutSession.session;
      let orgId = session?.activeOrganizationId;

      if (!orgId) {
        const membership = await prisma.member.findFirst({
          where: { userId: user.id },
          select: { organizationId: true },
        });
        orgId = membership?.organizationId;
      }

      await logApiExecution({
        organizationId: orgId || null,
        userId: user.id,
        serviceCode: "AUTH",
        action: "Operator Logout & Session Terminated",
        endpoint: "/api/auth/sign-out",
        reference: `AUTH-${session?.id?.slice(0, 8)?.toUpperCase() || "LOGOUT"}`,
        status: "SUCCESS",
        statusCode: 200,
        ipAddress: c.req.header("x-forwarded-for") || session?.ipAddress || "127.0.0.1",
        note: `${user.name} (${user.email}) signed out of Cyber Café workspace. Session terminated.`,
      });
    } catch {
      // Non-blocking
    }
  }

  // 4. Log Successful Sign-In or Sign-Up
  if ((isSignIn || isSignUp) && res.status >= 200 && res.status < 400) {
    try {
      let loggedUser: { id: string; email: string; name?: string | null } | null = null;
      let sessionToken = "";

      // Try reading JSON body from cloned response
      try {
        const clonedRes = res.clone();
        const resJson = (await clonedRes.json().catch(() => null)) as {
          user?: { id: string; email: string; name?: string | null };
          token?: string;
          session?: { token?: string };
        } | null;
        if (resJson?.user) {
          loggedUser = resJson.user;
          sessionToken = resJson.token || resJson.session?.token || "";
        }
      } catch {
        // Response may be redirect or non-json
      }

      // If OAuth redirect or no user in body, check Set-Cookie header
      if (!loggedUser) {
        const setCookie = res.headers.get("set-cookie") || "";
        const match = setCookie.match(/better-auth\.session_token=([^;]+)/) ||
                      setCookie.match(/better-auth=([^;]+)/);
        if (match) {
          sessionToken = decodeURIComponent(match[1]).split(".")[0];
          const sessionRecord = await prisma.session.findFirst({
            where: {
              OR: [
                { token: sessionToken },
                { token: { startsWith: sessionToken } },
              ],
            },
            include: { user: true },
          });
          if (sessionRecord) {
            loggedUser = sessionRecord.user;
          }
        }
      }

      // Fallback: Lookup by attempt email
      if (!loggedUser && reqEmail) {
        loggedUser = await prisma.user.findUnique({ where: { email: reqEmail } });
      }

      if (loggedUser) {
        const membership = await prisma.member.findFirst({
          where: { userId: loggedUser.id },
          select: { organizationId: true },
        });
        const orgId = membership?.organizationId;

        await logApiExecution({
          organizationId: orgId || null,
          userId: loggedUser.id,
          serviceCode: "AUTH",
          action: isSignUp
            ? "New Retailer Registered & Session Started"
            : "Operator Login & Session Started",
          endpoint: c.req.path,
          reference: `AUTH-${loggedUser.id.slice(0, 8).toUpperCase()}`,
          status: "SUCCESS",
          statusCode: res.status,
          ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
          note: `${loggedUser.name || "Operator"} (${loggedUser.email}) authenticated to Cyber Café workspace.`,
        });
      }
    } catch {
      // Non-blocking
    }
  }

  // 5. Log Failed Sign-In Attempt (Security Checkpoint)
  if (isSignIn && res.status >= 400) {
    try {
      await logApiExecution({
        organizationId: null,
        userId: null,
        serviceCode: "AUTH",
        action: "Failed Operator Login Attempt",
        endpoint: c.req.path,
        reference: reqEmail ? `AUTH-${reqEmail.slice(0, 8).toUpperCase()}` : "AUTH-FAIL",
        status: "FAILED",
        statusCode: res.status,
        ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
        note: reqEmail
          ? `Failed authentication attempt for ${reqEmail}. Invalid credentials or unauthorized.`
          : "Failed authentication attempt. Invalid credentials.",
      });
    } catch {
      // Non-blocking
    }
  }

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

// Fallback redirects if frontend URLs are hit on API origin
app.get("/dashboard", (c) => {
  const origin = env.CORS_ORIGIN[0];
  return c.redirect(`${origin}/dashboard`);
});

app.get("/admin/dashboard", (c) => {
  const origin = env.CORS_ORIGIN[0];
  return c.redirect(`${origin}/admin/dashboard`);
});

// Global Error Handling
app.onError(errorHandler);
export type App = typeof app;

