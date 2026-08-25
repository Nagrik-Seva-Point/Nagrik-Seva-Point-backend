import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { getEnvVar } from "../config/env-helper";

const { PrismaClient } = pkg;

const databaseUrl = getEnvVar("DATABASE_URL");
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
export type PrismaClientType = InstanceType<typeof PrismaClient>;
