import { env } from "./env.ts";

export const CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "User-Agent",
  "X-Requested-With",
  "X-Organization-Id",
  "x-guest-session-id",
  "Accept",
  "Origin",
  "Cookie",
  "Set-Cookie",
];

export const getAllowedCorsOrigin = (origin?: string | null): string | undefined => {
  if (!origin) {
    return undefined;
  }

  const cleanOrigin = origin.trim().toLowerCase();

  // Read strictly from CORS_ORIGIN environment variable
  return env.CORS_ORIGIN.some((o) => o.toLowerCase() === cleanOrigin) ? origin : undefined;
};
