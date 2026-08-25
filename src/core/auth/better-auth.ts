import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "../db/prisma";
import { bearer, organization } from "better-auth/plugins";
import { env } from "../config/env";

const getCookieDomain = (): string | undefined => {
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return undefined;
    }
    const parts = url.hostname.split(".");
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join(".")}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const cookieDomain = getCookieDomain();

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: env.CORS_ORIGIN,
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false, // Prevents regular users from setting role during signup
      },
    },
  },
  socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        disableSignUp: true, // Only allow existing registered users to log in with Google
      },
    }
    : undefined,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // 1. Check phone number uniqueness on /sign-up/email before database insertion
      if (ctx.path === "/sign-up/email") {
        const body = ctx.body as Record<string, any> | undefined;
        if (body && typeof body.phone === "string" && body.phone.trim()) {
          const cleanPhone = body.phone.trim();
          const existing = await prisma.user.findFirst({
            where: { phone: cleanPhone },
          });

          if (existing) {
            throw new APIError("BAD_REQUEST", {
              message:
                `An account with mobile number ${cleanPhone} already exists. Please sign in instead.`,
            });
          }

          body.phone = cleanPhone;
        }
      }
    }),
  },
  advanced: {
    trustHost: true,
    crossSubDomainCookies: cookieDomain
      ? {
        enabled: true,
        domain: cookieDomain,
      }
      : undefined,
    defaultCookieAttributes: {
      domain: cookieDomain,
      sameSite: cookieDomain ? "lax" : "none",
      secure: true,
      httpOnly: true,
      path: "/",
    },
  },
  plugins: [
    organization(), // Better Auth multi-tenant organization support
    bearer(), // Enables Authorization: Bearer <token>
  ],
});

type Auth = typeof auth;
export type { Auth };

