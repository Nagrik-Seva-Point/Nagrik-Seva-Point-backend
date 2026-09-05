import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { getEnvVar } from "../config/env-helper";

const { PrismaClient } = pkg;

const databaseUrl = getEnvVar("DATABASE_URL");
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

type GlobalWithPrisma = typeof globalThis & {
  __prismaPool?: pg.Pool;
  __prismaClient?: InstanceType<typeof PrismaClient>;
};

const globalCtx = globalThis as GlobalWithPrisma;

const poolMax = parseInt(process.env.DATABASE_POOL_MAX || "20", 10);

if (!globalCtx.__prismaPool) {
  globalCtx.__prismaPool = new pg.Pool({
    connectionString: databaseUrl,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });
}

const pool = globalCtx.__prismaPool;

if (!globalCtx.__prismaClient) {
  const adapter = new PrismaPg(pool);
  globalCtx.__prismaClient = new PrismaClient({ adapter });
}

export const prisma = globalCtx.__prismaClient;
export type PrismaClientType = InstanceType<typeof PrismaClient>;
