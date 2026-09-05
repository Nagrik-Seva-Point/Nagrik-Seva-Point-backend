import Redis, { type RedisOptions } from "ioredis";
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

  constructor() {
    this.initClient();
  }

  private initClient() {
    const redisUrl = getEnvVar("REDIS_URL");
    if (!redisUrl) {
      logger.warn("[Redis] REDIS_URL environment variable is not defined. Redis operations will gracefully fallback.");
      this.client = null;
      this.isConnected = false;
      return;
    }
      
    const isTls =
      redisUrl.startsWith("rediss://") ||
      getEnvVar("REDIS_TLS") === "true";

    const options: RedisOptions = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        logger.warn(`[Redis] Connection retry attempt #${times} in ${delay}ms`);
        return delay;
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

      this.client.on("error", (err) => {
        this.isConnected = false;
        logger.error(`[Redis] Connection error: ${err?.message || err}`);
      });

      this.client.on("close", () => {
        this.isConnected = false;
        logger.warn(`[Redis] Connection closed.`);
      });
    } catch (err: any) {
      logger.error(`[Redis] Failed to initialize Redis client: ${err?.message}`);
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
    } catch (err: any) {
      logger.error(`[Redis] Error getting key "${key}": ${err?.message}`);
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
    } catch (err: any) {
      logger.error(`[Redis] Error setting key "${key}": ${err?.message}`);
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
    } catch (err: any) {
      logger.error(`[Redis] Error serializing JSON for key "${key}": ${err?.message}`);
      return false;
    }
  }

  public async getJson<T>(key: string): Promise<T | null> {
    try {
      const val = await this.get(key);
      if (!val) return null;
      return JSON.parse(val) as T;
    } catch (err: any) {
      logger.error(`[Redis] Error parsing JSON for key "${key}": ${err?.message}`);
      return null;
    }
  }

  public async del(key: string): Promise<boolean> {
    try {
      const client = this.getRawClient();
      if (!client) return false;
      await client.del(key);
      return true;
    } catch (err: any) {
      logger.error(`[Redis] Error deleting key "${key}": ${err?.message}`);
      return false;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      const client = this.getRawClient();
      if (!client) return -2;
      return await client.ttl(key);
    } catch (err: any) {
      logger.error(`[Redis] Error checking TTL for key "${key}": ${err?.message}`);
      return -2;
    }
  }

  /**
   * Universal Redis Cache Helper
   * Checks Redis for cached data. If found, returns immediately (0ms DB query).
   * Otherwise executes fetcher(), caches the result in Redis with TTL, and returns it.
   */
  public async remember<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    try {
      const cached = await this.getJson<T>(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch (err: any) {
      logger.warn(`[Redis] Cache lookup failed for key "${key}": ${err?.message}`);
    }

    const freshData = await fetcher();

    if (freshData !== null && freshData !== undefined) {
      this.setJson(key, freshData, ttlSeconds).catch((err) => {
        logger.warn(`[Redis] Cache set failed for key "${key}": ${err?.message}`);
      });
    }

    return freshData;
  }

  /**
   * Delete all keys matching a wildcard pattern (e.g. "cache:services:*")
   */
  public async delPattern(pattern: string): Promise<number> {
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
    } catch (err: any) {
      logger.error(`[Redis] Error deleting pattern "${pattern}": ${err?.message}`);
      return 0;
    }
  }
}

export const redis = new RedisClient();
