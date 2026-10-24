import { Redis, type RedisOptions } from "ioredis";
import { logger } from "../logger/logger";
import { getEnvVar } from "../config/env-helper";

/**
 * Enterprise Reusable Redis Client
 * Supports local development (redis://) and Cloud Production (Aiven rediss:// with TLS)
 * Includes graceful degradation if Redis is unavailable.
 */
class RedisClient {
  private client: Redis | null = null;
  private isConnected = false;
  private memoryCache = new Map<string, { value: any; expiresAt: number }>();

  constructor() {
    this.initClient();
  }

  private initClient() {
    let redisUrl = getEnvVar("REDIS_URL");
    if (redisUrl) {
      redisUrl = redisUrl.trim().replace(/^["']|["';]+$/g, "").trim();
    }
    
    // Serverless Protection: Don't attempt localhost connections on Vercel
    const isServerless = process.env.VERCEL === "1" || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const isLocalhost = redisUrl?.includes("127.0.0.1") || redisUrl?.includes("localhost");

    if (isServerless && isLocalhost) {
      logger.info("[Redis] Localhost Redis URL in Serverless environment. Using fast in-memory L1 cache fallback.");
      this.client = null;
      this.isConnected = false;
      return;
    }

    if (!redisUrl) {
      logger.warn("[Redis] REDIS_URL environment variable is not defined. Redis operations will gracefully fallback to in-memory L1 cache.");
      this.client = null;
      this.isConnected = false;
      return;
    }
      
    const isTls =
      redisUrl.startsWith("rediss://") ||
      getEnvVar("REDIS_TLS") === "true";

    const options: RedisOptions = {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 2) return null;
        return 200;
      },
    };

    if (isTls) {
      options.tls = {
        rejectUnauthorized: false, // Required for managed cloud providers like Aiven
      };
    }

    try {
      this.client = new Redis(redisUrl, options);

      this.client.on("connect", () => {
        this.isConnected = true;
        logger.info(`[Redis] Successfully connected to Redis instance.`);
      });

      this.client.on("ready", () => {
        this.isConnected = true;
        logger.info(`[Redis] Redis connection ready for operations.`);
      });

      this.client.on("error", (err: unknown) => {
        this.isConnected = false;
        logger.error(`[Redis] Connection error: ${err instanceof Error ? err.message : String(err)}`);
      });

      this.client.on("close", () => {
        this.isConnected = false;
        logger.warn(`[Redis] Connection closed.`);
      });
    } catch (err: unknown) {
      logger.error(`[Redis] Failed to initialize Redis client: ${err instanceof Error ? err.message : String(err)}`);
      this.client = null;
    }
  }

  public getRawClient(): Redis | null {
    if (!this.client && getEnvVar("REDIS_URL")) {
      this.initClient();
    }
    return this.client;
  }

  public async get(key: string): Promise<string | null> {
    try {
      const client = this.getRawClient();
      if (!client) return null;
      return await client.get(key);
    } catch (err: unknown) {
      logger.error(`[Redis] Error getting key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  public async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      const client = this.getRawClient();
      if (!client) return false;

      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, value, "EX", ttlSeconds);
      } else {
        await client.set(key, value);
      }
      return true;
    } catch (err: unknown) {
      logger.error(`[Redis] Error setting key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  public async setJson(
    key: string,
    data: unknown,
    ttlSeconds?: number,
  ): Promise<boolean> {
    try {
      const jsonStr = JSON.stringify(data);
      return await this.set(key, jsonStr, ttlSeconds);
    } catch (err: unknown) {
      logger.error(`[Redis] Error serializing JSON for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  public async getJson<T>(key: string): Promise<T | null> {
    try {
      const val = await this.get(key);
      if (!val) return null;
      return JSON.parse(val) as T;
    } catch (err: unknown) {
      logger.error(`[Redis] Error parsing JSON for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  public async del(key: string): Promise<boolean> {
    this.memoryCache.delete(key);
    try {
      const client = this.getRawClient();
      if (!client) return false;
      await client.del(key);
      return true;
    } catch (err: unknown) {
      logger.error(`[Redis] Error deleting key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  public async ttl(key: string): Promise<number> {
    const mem = this.memoryCache.get(key);
    if (mem && mem.expiresAt > Date.now()) {
      return Math.round((mem.expiresAt - Date.now()) / 1000);
    }
    try {
      const client = this.getRawClient();
      if (!client) return -2;
      return await client.ttl(key);
    } catch (err: unknown) {
      logger.error(`[Redis] Error checking TTL for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      return -2;
    }
  }

  /**
   * High-Performance Multi-Layer Cache Helper (L1 In-Memory + L2 Redis)
   * 1. Checks in-memory L1 cache (< 0.1ms latency, 0 DB roundtrips).
   * 2. Checks Redis L2 if available.
   * 3. Falls back to fetcher(), then populates L1 & L2 caches.
   */
  public async remember<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // 1. Ultra-fast L1 In-Memory Cache (< 0.1ms)
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.value as T;
    }

    // 2. Redis L2 Cache lookup
    try {
      const cached = await this.getJson<T>(key);
      if (cached !== null && cached !== undefined) {
        this.memoryCache.set(key, {
          value: cached,
          expiresAt: Date.now() + Math.min(ttlSeconds, 300) * 1000,
        });
        return cached;
      }
    } catch (err: unknown) {
      logger.warn(`[Redis] Cache lookup failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Fresh data fetch from database/gateway
    const freshData = await fetcher();

    if (freshData !== null && freshData !== undefined) {
      // Memory protection: cap at 2000 entries
      if (this.memoryCache.size > 2000) {
        const firstKey = this.memoryCache.keys().next().value;
        if (firstKey) this.memoryCache.delete(firstKey);
      }

      this.memoryCache.set(key, {
        value: freshData,
        expiresAt: Date.now() + Math.min(ttlSeconds, 300) * 1000,
      });

      this.setJson(key, freshData, ttlSeconds).catch((err: unknown) => {
        logger.warn(`[Redis] Cache set failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return freshData;
  }

  /**
   * Delete all keys matching a wildcard pattern (e.g. "cache:services:*")
   */
  public async delPattern(pattern: string): Promise<number> {
    // Invalidate from In-Memory L1 Cache
    try {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      for (const k of this.memoryCache.keys()) {
        if (regex.test(k)) {
          this.memoryCache.delete(k);
        }
      }
    } catch {
      // Ignore regex parsing error
    }

    try {
      const client = this.getRawClient();
      if (!client) return 0;

      const stream = client.scanStream({
        match: pattern,
        count: 100,
      });

      let deletedCount = 0;
      for await (const keys of stream) {
        if (keys && keys.length > 0) {
          const pipeline = client.pipeline();
          for (const k of keys) {
            pipeline.del(k);
          }
          await pipeline.exec();
          deletedCount += keys.length;
        }
      }
      return deletedCount;
    } catch (err: unknown) {
      logger.error(`[Redis] Error deleting pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }
}

export const redis = new RedisClient();
