import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 CLI tasks (migrations, db push) use the connection string configured under `url` here.
// To bypass prepared statement transaction-mode pooler errors, we point this URL to the direct connection (DIRECT_URL).
// We fall back to DATABASE_URL or a placeholder for local setups and container builds.
const cliDatabaseUrl = 
  (typeof Deno !== "undefined" ? Deno.env.get("DIRECT_URL") : undefined) ||
  (typeof process !== "undefined" ? process.env.DIRECT_URL : undefined) ||
  (typeof Deno !== "undefined" ? Deno.env.get("DATABASE_URL") : undefined) ||
  (typeof process !== "undefined" ? process.env.DATABASE_URL : undefined) ||
  "postgresql://placeholder_for_build_only:5432";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
