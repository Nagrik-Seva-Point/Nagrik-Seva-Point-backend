import type { Context, MiddlewareHandler } from "hono";
import { auth } from "../core/auth/better-auth";
import { prisma } from "../core/db/prisma";
import type { ContextVariables } from "../app/context";
import type { RequestContext } from "../core/types/context.types";
import { logger } from "../core/logger/logger";

interface CachedAuthContext {
  session: any;
  user: any;
  organizationId: string | null;
  organization: any;
  requestContext: RequestContext;
  expiresAt: number;
}

const authContextCache = new Map<string, CachedAuthContext>();

export function invalidateAuthContext(token?: string) {
  if (token) {
    authContextCache.delete(token);
  } else {
    authContextCache.clear();
  }
}

function extractAuthToken(c: Context<ContextVariables>): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customToken = c.req.header("x-session-token");
  if (customToken) return customToken.trim();

  const cookieHeader = c.req.header("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:better-auth\.session_token|__Secure-better-auth\.session_token)=([^;]+)/);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export const requestContextMiddleware = (): MiddlewareHandler<
  ContextVariables
> => {
  return async (c: Context<ContextVariables>, next) => {
    try {
      const token = extractAuthToken(c);
      const requestedOrgId = c.req.header("X-Organization-Id") || c.req.header("x-organization-id");
      const cacheKey = token ? `${token}:${requestedOrgId || "DEFAULT"}` : null;

      // 1. Check ultra-fast L1 Auth Context Cache (< 0.1ms)
      if (cacheKey) {
        const cached = authContextCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          c.set("user", cached.user);
          c.set("session", cached.session);
          if (cached.organizationId) {
            c.set("organizationId", cached.organizationId);
          }
          if (cached.organization) {
            c.set("organization", cached.organization);
          }
          c.set("requestContext", cached.requestContext);
          return await next();
        }
      }

      // 2. Check for authenticated session via Better Auth
      let session = await auth.api.getSession({
        headers: c.req.raw.headers,
      }).catch(() => null);

      // Fallback: Check Bearer token or x-session-token in database if header was supplied
      if (!session || !session.user) {
        const authHeader = c.req.header("Authorization");
        const bearerToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : null;
        const customToken = c.req.header("x-session-token");
        const token = bearerToken || customToken;

        if (token) {
          const sessionRecord = await prisma.session.findUnique({
            where: { token },
            include: { user: true },
          });

          if (sessionRecord && sessionRecord.expiresAt > new Date()) {
            session = {
              session: sessionRecord,
              user: sessionRecord.user,
            } as unknown as typeof session;
          }
        }
      }

      if (session && session.user) {
        // 2. Resolve Retailer Organization Context
        const userId = session.user.id;
        const requestedOrgId = c.req.header("X-Organization-Id") || c.req.header("x-organization-id");
        let organizationId = requestedOrgId || session.session.activeOrganizationId;

        // If no activeOrganizationId on session, query user's primary membership
        if (!organizationId) {
          const membership = await prisma.member.findFirst({
            where: { userId },
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          });

          if (membership) {
            organizationId = membership.organizationId;
            c.set("organization", membership.organization);
          }
        } else {
          // Verify user actually belongs to this organization in DB (BOLA Protection)
          const membership = await prisma.member.findFirst({
            where: { userId, organizationId },
            include: { organization: true },
          });

          if (membership) {
            c.set("organization", membership.organization);
          } else {
            logger.warn(
              `User ${userId} attempted to access unauthorized org ${organizationId}`,
            );
            organizationId = null;
          }
        }

        const requestContext: RequestContext = {
          accessMode: "RETAILER",
          userId,
          organizationId: organizationId || null,
          customerId: null, // Populated per-request payload if present
          pricingTier: "PARTNER",
          guestSessionId: null,
        };

        c.set("user", session.user);
        c.set("session", session.session);
        c.set("organizationId", organizationId || undefined);
        c.set("requestContext", requestContext);

        // Cache resolved context for 30s to eliminate redundant DB calls
        if (cacheKey) {
          if (authContextCache.size > 2000) {
            const firstKey = authContextCache.keys().next().value;
            if (firstKey) authContextCache.delete(firstKey);
          }
          authContextCache.set(cacheKey, {
            session: session.session,
            user: session.user,
            organizationId: organizationId || null,
            organization: c.get("organization") || null,
            requestContext,
            expiresAt: Date.now() + 30 * 1000,
          });
        }
      } else {
        // 3. Resolve Guest Context
        let guestSessionId = c.req.header("x-guest-session-id");
        if (!guestSessionId) {
          guestSessionId = `gst_${
            crypto.randomUUID().replace(/-/g, "").substring(0, 16)
          }`;
        }

        const requestContext: RequestContext = {
          accessMode: "GUEST",
          userId: null,
          organizationId: null,
          customerId: null,
          pricingTier: "PUBLIC",
          guestSessionId,
        };

        c.set("user", null);
        c.set("session", null);
        c.set("organizationId", undefined);
        c.set("organization", null);
        c.set("requestContext", requestContext);
      }
    } catch (error) {
      logger.error("Error resolving request context:", error);
      // Fallback to Guest on session error
      const guestSessionId = `gst_${
        crypto.randomUUID().replace(/-/g, "").substring(0, 16)
      }`;
      c.set("requestContext", {
        accessMode: "GUEST",
        userId: null,
        organizationId: null,
        customerId: null,
        pricingTier: "PUBLIC",
        guestSessionId,
      });
    }

    await next();
  };
};
