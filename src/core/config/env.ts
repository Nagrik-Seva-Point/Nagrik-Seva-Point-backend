import { z } from "zod";
import { getEnvVar } from "./env-helper.ts";

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
});

const getEnv = () => {
  const result = envSchema.safeParse({
    DATABASE_URL: getEnvVar("DATABASE_URL"),
    BETTER_AUTH_SECRET: getEnvVar("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: getEnvVar("BETTER_AUTH_URL"),
    CORS_ORIGIN: getEnvVar("CORS_ORIGIN"),
    PORT: getEnvVar("PORT") || "8000",
  });

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables configuration");
  }

  return result.data;
};

export const env = getEnv();
