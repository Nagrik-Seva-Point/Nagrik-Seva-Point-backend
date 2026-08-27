import Redis, { type RedisOptions } from "ioredis";
import { logger } from "../logger/logger";
import { getEnvVar } from "../config/env-helper";

/**
 * Enterprise Reusable Redis Client
 * Supports local development (redis://) and Cloud Production (Aiven rediss:// with TLS)
 */
class RedisClient {
  private client: Redis | null = null;
  private isConnected = false;

  constructor() {
    this.initClient();
  }

  private initClient() {
    const redisUrl = getEnvVar("REDIS_URL")!;
      
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
    }
  }

  public getRawClient(): Redis {
    if (!this.client) {
      this.initClient();
    }
    return this.client!;
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.getRawClient().get(key);
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
      if (ttlSeconds && ttlSeconds > 0) {
        await this.getRawClient().set(key, value, "EX", ttlSeconds);
      } else {
        await this.getRawClient().set(key, value);
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
      await this.getRawClient().del(key);
      return true;
    } catch (err: any) {
      logger.error(`[Redis] Error deleting key "${key}": ${err?.message}`);
      return false;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      return await this.getRawClient().ttl(key);
    } catch (err: any) {
      logger.error(`[Redis] Error checking TTL for key "${key}": ${err?.message}`);
      return -2;
    }
  }
}

export const redis = new RedisClient();
