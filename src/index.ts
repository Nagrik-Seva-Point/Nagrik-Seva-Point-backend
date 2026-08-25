import { app } from "./app/app";
import { env } from "./core/config/env";
import { logger } from "./core/logger/logger";

export default app;

const runtime = globalThis as typeof globalThis & {
  Deno?: {
    serve: (options: { port: number }, handler: typeof app.fetch) => unknown;
  };
};
const importMeta = import.meta as ImportMeta & { main?: boolean };

if (runtime.Deno && importMeta.main) {
  logger.info(`Starting Nagrik Seva backend on port ${env.PORT}...`);
  runtime.Deno.serve({ port: env.PORT }, app.fetch);
}
