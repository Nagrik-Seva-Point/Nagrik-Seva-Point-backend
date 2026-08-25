/**
 * Safe utility to retrieve environment variables across multiple runtimes (Deno and Node.js/Vercel).
 */
export const getEnvVar = (key: string): string | undefined => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get: (key: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };

  if (runtime.Deno?.env) {
    return runtime.Deno.env.get(key);
  }

  if (runtime.process?.env) {
    return runtime.process.env[key];
  }

  return undefined;
};
