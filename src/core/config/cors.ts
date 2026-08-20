import { env } from "./env.ts";

export const CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
export const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "User-Agent",
  "X-Requested-With",
  "X-Organization-Id",
];

export const getAllowedCorsOrigin = (origin?: string | null) => {
  if (!origin) {
    return undefined;
  }

  return env.CORS_ORIGIN.includes(origin) ? origin : undefined;
};
