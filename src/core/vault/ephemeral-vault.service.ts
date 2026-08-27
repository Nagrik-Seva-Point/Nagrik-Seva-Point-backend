import { redis } from "../redis/redis.client";
import { logger } from "../logger/logger";
import { encryptPanToken, decryptPanToken } from "../security/crypto.util";
import crypto from "node:crypto";
import { getEnvVar } from "../config/env-helper";

/**
 * 24-Hour Ephemeral Vault Service
 * Compliant with India's DPDP Act (2023) - Automated Hardware-Enforced In-Memory TTL
 */
export class EphemeralVaultService {
  private readonly DEFAULT_VAULT_TTL = 86400; // 24 Hours in seconds
  private readonly TEMP_SEARCH_TOKEN_TTL = 1800; // 30 Minutes in seconds

  private getVaultKey(requestId: string): string {
    return `vault:request:${requestId}`;
  }

  private getTempTokenKey(requestId: string): string {
    return `temp:token:${requestId}`;
  }

  /**
   * Encrypts any sensitive payload with AES-256-GCM
   */
  private encryptPayload(data: Record<string, any>): string {
    const secret =
      getEnvVar("ENCRYPTION_SECRET") ||
      getEnvVar("BETTER_AUTH_SECRET") ||
      "nagrik-seva-point-pan-security-key-2026";

    const key = crypto.createHash("sha256").update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const jsonStr = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(jsonStr, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  /**
   * Decrypts and authenticates an AES-256-GCM payload
   */
  private decryptPayload(encryptedStr: string): Record<string, any> | null {
    try {
      const parts = encryptedStr.split(".");
      if (parts.length !== 3) return null;

      const [ivB64, authTagB64, ciphertextB64] = parts;
      const iv = Buffer.from(ivB64, "base64url");
      const authTag = Buffer.from(authTagB64, "base64url");
      const ciphertext = Buffer.from(ciphertextB64, "base64url");

      const secret =
        getEnvVar("ENCRYPTION_SECRET") ||
        getEnvVar("BETTER_AUTH_SECRET") ||
        "nagrik-seva-point-pan-security-key-2026";

      const key = crypto.createHash("sha256").update(secret).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString("utf8"));
    } catch (err: any) {
      logger.error(`[EphemeralVault] Failed to decrypt payload: ${err?.message}`);
      return null;
    }
  }

  /**
   * Stashes ephemeral search token during checkout lifecycle (30-min TTL)
   * Prevents any search token / customer input from ever touching PostgreSQL
   */
  async stashTempSearchToken(requestId: string, searchToken: string): Promise<boolean> {
    const key = this.getTempTokenKey(requestId);
    logger.info(`[EphemeralVault] Stashing temporary search token for request ${requestId} (TTL: 30m)`);
    return await redis.set(key, searchToken, this.TEMP_SEARCH_TOKEN_TTL);
  }

  /**
   * Retrieves ephemeral search token for Cashfree fulfillment
   */
  async getTempSearchToken(requestId: string): Promise<string | null> {
    const key = this.getTempTokenKey(requestId);
    return await redis.get(key);
  }

  /**
   * Stores completed verified service report in encrypted Redis vault with 24h auto-expiry
   */
  async storeVaultItem(
    requestId: string,
    data: Record<string, any>,
    ttlSeconds = this.DEFAULT_VAULT_TTL,
  ): Promise<boolean> {
    const key = this.getVaultKey(requestId);
    const encryptedStr = this.encryptPayload(data);

    logger.info(
      `[EphemeralVault] Storing 24h encrypted vault item for request ${requestId} (TTL: ${ttlSeconds}s)`,
    );

    // Also clean up temporary token
    await redis.del(this.getTempTokenKey(requestId));

    return await redis.set(key, encryptedStr, ttlSeconds);
  }

  /**
   * Retrieves and decrypts 24-hour vault item for retailer overview & history
   */
  async getVaultItem(requestId: string): Promise<{
    data: Record<string, any> | null;
    isExpired: boolean;
    remainingTtlSeconds: number;
    expiresAt: string | null;
  }> {
    const key = this.getVaultKey(requestId);
    const [encryptedStr, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);

    if (!encryptedStr || ttl <= 0) {
      return {
        data: null,
        isExpired: true,
        remainingTtlSeconds: 0,
        expiresAt: null,
      };
    }

    const decrypted = this.decryptPayload(encryptedStr);

    if (!decrypted) {
      return {
        data: null,
        isExpired: true,
        remainingTtlSeconds: 0,
        expiresAt: null,
      };
    }

    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    return {
      data: decrypted,
      isExpired: false,
      remainingTtlSeconds: ttl,
      expiresAt,
    };
  }

  /**
   * Deletes vault item explicitly if needed
   */
  async deleteVaultItem(requestId: string): Promise<boolean> {
    const key = this.getVaultKey(requestId);
    return await redis.del(key);
  }
}

export const ephemeralVault = new EphemeralVaultService();
