import { app } from "./app/app";
import { env } from "./core/config/env";
import { logger } from "./core/logger/logger";

logger.info(`Starting Nagrik Seva backend on port ${env.PORT}...`);

Deno.serve({ port: env.PORT }, app.fetch);
