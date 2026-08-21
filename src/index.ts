import { app } from "./app/app.ts";
import { env } from "./core/config/env.ts";
import { logger } from "./core/logger/logger.ts";

logger.info(`Starting Nagrik Seva backend on port ${env.PORT}...`);

Deno.serve({ port: env.PORT }, app.fetch);
