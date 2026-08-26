import crypto from "node:crypto";
import { AppError } from "../errors/AppError";
import { getEnvVar } from "../config/env-helper";

/**
 * Derives a 32-byte AES-256 key from server environment secret
 */
function getEncryptionKey(): Buffer {
  const secret =
    getEnvVar("ENCRYPTION_SECRET") ||
    getEnvVar("BETTER_AUTH_SECRET") ||
    "nagrik-seva-point-pan-security-key-2026";

  return crypto.createHash("sha256").update(secret).digest();
}

export interface PanTokenPayload {
  pan: string;
  aadhaarMasked?: string;
  exp?: number;
}

/**
 * Encrypts PAN number and metadata into a secure, URL-safe AES-256-GCM token
 * TTL defaults to 30 minutes.
 */
export function encryptPanToken(payload: PanTokenPayload): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 12-byte standard GCM IV
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const tokenData: PanTokenPayload = {
    pan: payload.pan.trim().toUpperCase(),
    aadhaarMasked: payload.aadhaarMasked,
    exp: payload.exp || Date.now() + 30 * 60 * 1000, // 30 mins expiry
  };

  const jsonStr = JSON.stringify(tokenData);
  const encrypted = Buffer.concat([cipher.update(jsonStr, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  // Format: iv.authTag.ciphertext (URL-safe base64)
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Decrypts and verifies an AES-256-GCM token, ensuring authenticity and validity
 */
export function decryptPanToken(token: string): PanTokenPayload {
  if (!token || typeof token !== "string") {
    throw AppError.badRequest("Invalid or missing PAN token.", "INVALID_TOKEN");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw AppError.badRequest("Malformed PAN search token.", "INVALID_TOKEN");
  }

  try {
    const [ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, "base64url");
    const authTag = Buffer.from(authTagB64, "base64url");
    const ciphertext = Buffer.from(ciphertextB64, "base64url");

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as PanTokenPayload;

    if (!parsed.pan) {
      throw AppError.badRequest("PAN data not found in token.", "INVALID_TOKEN");
    }

    if (parsed.exp && parsed.exp < Date.now()) {
      throw AppError.badRequest(
        "Your PAN verification session has expired. Please search again.",
        "TOKEN_EXPIRED"
      );
    }

    return parsed;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest(
      "Unable to verify PAN token. Please perform a fresh search.",
      "INVALID_TOKEN"
    );
  }
}
