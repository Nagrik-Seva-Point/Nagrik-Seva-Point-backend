import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "../db/prisma";
import { bearer, emailOTP, organization } from "better-auth/plugins";
import { env } from "../config/env";
import { getEnvVar } from "../config/env-helper";
import { logger } from "../logger/logger";
import { brevoMailService } from "../mail/brevo.service";

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
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes fast cookie cache to prevent database hits
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url, token }, _request) => {
      // Determine the cleanest user-facing reset URL
      // If Better-Auth generated an internal backend redirect URL with a callbackURL param,
      // unwrap it to provide a direct link to the frontend reset page.
      let directResetUrl = url;
      try {
        const parsed = new URL(url);
        const callback = parsed.searchParams.get("callbackURL");
        if (callback) {
          directResetUrl = `${callback}?token=${token}`;
        }
      } catch {
        // Fallback to raw url
      }

      logger.info(
        `🔑 [PASSWORD RESET] Link generated for ${user.email} (${user.name}): DirectURL=${directResetUrl}, Token=${token}`,
      );

      // Dispatch via Brevo Transactional Email Service
      await brevoMailService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: directResetUrl,
        token,
      });
    },
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
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        disableSignUp: true, // Only allow registered users to log in with Google
      },
    }
    : undefined,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // 1. Phone number lookup for /sign-in/email, /email-otp/send-verification-otp, and /sign-in/email-otp
      if (
        ctx.path === "/sign-in/email" ||
        ctx.path === "/email-otp/send-verification-otp" ||
        ctx.path === "/sign-in/email-otp"
      ) {
        const body = ctx.body as Record<string, unknown> | undefined;
        if (body && typeof body.email === "string") {
          const rawIdentifier = body.email.trim();
          if (!rawIdentifier.includes("@")) {
            // It's a phone number (must be strictly 10 digits)
            const cleanPhone = rawIdentifier.replace(/\D/g, "");

            if (cleanPhone.length !== 10) {
              throw new APIError("BAD_REQUEST", {
                message: "Mobile number must be exactly 10 digits",
                code: "INVALID_PHONE",
              });
            }

            const user = await prisma.user.findFirst({
              where: { phone: cleanPhone },
            });

            if (!user) {
              throw new APIError("NOT_FOUND", {
                message: "No account found with this 10-digit mobile number. Please register first.",
                code: "ACCOUNT_NOT_FOUND",
              });
            }

            body.email = user.email;
          } else {
            const cleanEmail = rawIdentifier.toLowerCase();

            // Strictly require account existence before sending login OTP
            if (ctx.path === "/email-otp/send-verification-otp") {
              const user = await prisma.user.findFirst({
                where: { email: cleanEmail },
              });

              if (!user) {
                throw new APIError("NOT_FOUND", {
                  message: "No account found with this email address. Please register first.",
                  code: "ACCOUNT_NOT_FOUND",
                });
              }
            }

            body.email = cleanEmail;
          }
        }
      }

      // 2. Check phone number uniqueness on /sign-up/email before database insertion
      if (ctx.path === "/sign-up/email") {
        const body = ctx.body as Record<string, unknown> | undefined;
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
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "sign-in") {
          const user = await prisma.user.findUnique({
            where: { email },
            select: { name: true },
          }).catch(() => null);

          // Absolute guard: never send login OTP to an unregistered user
          if (!user) {
            return;
          }

          await brevoMailService.sendLoginOtpEmail({
            to: email,
            name: user?.name,
            otp,
          });
        }
      },
      otpLength: 6,
      expiresIn: 300,
      disableSignUp: true,
    }),
  ],
});

type Auth = typeof auth;
export type { Auth };

