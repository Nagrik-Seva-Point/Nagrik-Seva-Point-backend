import "dotenv/config";

/**
 * Cross-runtime utility to retrieve environment variables (Node.js, Vercel, Deno).
 */
export const getEnvVar = (key: string): string | undefined => {
  if (typeof process !== "undefined" && process.env && process.env[key] !== undefined) {
    return process.env[key];
  }

  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get: (key: string) => string | undefined } };
  };

  if (runtime.Deno?.env) {
    return runtime.Deno.env.get(key);
  }

  return undefined;
};
