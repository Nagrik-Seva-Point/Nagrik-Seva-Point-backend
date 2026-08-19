import "dotenv/config";
import { defineConfig } from "prisma/config";

// Read variable safely using process.env or Deno.env lookup to allow a fallback during Docker build time.
const databaseUrl = 
  (typeof Deno !== "undefined" ? Deno.env.get("DATABASE_URL") : undefined) ||
  (typeof process !== "undefined" ? process.env.DATABASE_URL : undefined) ||
  "postgresql://placeholder_for_build_only:5432";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl
  },
});
