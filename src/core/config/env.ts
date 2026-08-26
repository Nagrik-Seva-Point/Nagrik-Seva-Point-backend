import { z } from "zod";
import { getEnvVar } from "./env-helper";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1).transform((value, ctx) => {
    const origins = value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid CORS origin: ${origin}`,
          });
          return z.NEVER;
        }
      });

    return [...new Set(origins)];
  }),
  PORT: z.string().default("8000").transform((v) => parseInt(v, 10)),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  CASHFREE_API_URL: z.string().optional(),
  CASHFREE_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
});

export const getCashfreeConfig = () => {
  const clientId = getEnvVar("CASHFREE_CLIENT_ID") || "";
  const clientSecret = getEnvVar("CASHFREE_CLIENT_SECRET") || "";
  let environment = getEnvVar("CASHFREE_ENVIRONMENT") as "sandbox" | "production" | undefined;
  let apiUrl = getEnvVar("CASHFREE_API_URL");

  // Determine environment if not explicitly set
  if (!environment) {
    if (apiUrl?.includes("sandbox") || clientId.toUpperCase().startsWith("TEST")) {
      environment = "sandbox";
    } else if (apiUrl?.includes("api.cashfree.com") || clientId) {
      environment = "production";
    } else {
      environment = "sandbox";
    }
  }

  // Determine API URL based on environment
  if (!apiUrl) {
    apiUrl = environment === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  }

  return {
    clientId,
    clientSecret,
    apiUrl,
    environment,
  };
};

const getEnv = () => {
  const result = envSchema.safeParse({
    DATABASE_URL: getEnvVar("DATABASE_URL"),
    BETTER_AUTH_SECRET: getEnvVar("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: getEnvVar("BETTER_AUTH_URL"),
    CORS_ORIGIN: getEnvVar("CORS_ORIGIN"),
    PORT: getEnvVar("PORT") || "8000",
    GOOGLE_CLIENT_ID: getEnvVar("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: getEnvVar("GOOGLE_CLIENT_SECRET"),
    CASHFREE_CLIENT_ID: getEnvVar("CASHFREE_CLIENT_ID"),
    CASHFREE_CLIENT_SECRET: getEnvVar("CASHFREE_CLIENT_SECRET"),
    CASHFREE_API_URL: getEnvVar("CASHFREE_API_URL"),
    CASHFREE_ENVIRONMENT: getEnvVar("CASHFREE_ENVIRONMENT"),
  });

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables configuration");
  }

  return result.data;
};

export const env = getEnv();
