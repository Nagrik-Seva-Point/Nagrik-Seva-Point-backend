/**
 * Safe utility to retrieve environment variables across multiple runtimes (Deno and Node.js/Vercel).
 */
export const getEnvVar = (key: string): string | undefined => {
  // Check if Deno global is defined (Local dev or Deno deploy)
  // @ts-ignore: Deno is checked dynamically
  if (typeof Deno !== "undefined" && Deno.env) {
    // @ts-ignore: Deno is checked dynamically
    return Deno.env.get(key);
  }
  // Check if Node.js process global is defined (Vercel Serverless environment)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
};
