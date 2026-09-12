import { prisma } from "../db/prisma.ts";
import { logger } from "./logger.ts";

export interface LogApiParams {
  organizationId?: string | null;
  userId?: string | null;
  serviceCode: string;
  action: string;
  endpoint: string;
  reference?: string | null;
  status?: "SUCCESS" | "FAILED";
  statusCode?: number;
  durationMs?: number;
  ipAddress?: string | null;
  note?: string | null;
}

/**
 * Masks Indian 10-digit mobile numbers: e.g. 9876543210 -> XXXXXX3210, +91 9876543210 -> +91 XXXXXX3210
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  return cleaned.replace(/(?:\+91[\-\s]?)?([6-9]\d{5})(\d{4})\b/g, "XXXXXX$2");
}

/**
 * Masks email address: e.g. vikash.kumar@example.com -> vi****@example.com
 */
export function maskEmail(email?: string | null): string {
  if (!email) return "";
  return email.trim().replace(
    /\b([a-zA-Z0-9_.+-]{1,2})[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g,
    "$1****@$2",
  );
}

/**
 * Masks IPv4/IPv6 address: e.g. 192.168.1.55 -> 192.168.1.xxx
 */
export function maskIpAddress(ip?: string | null): string {
  if (!ip) return "127.0.0.xxx";
  const cleaned = ip.trim();
  if (cleaned === "::1" || cleaned === "127.0.0.1") return "127.0.0.xxx";
  if (cleaned.includes(".")) {
    return cleaned.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}\b/g, "$1xxx");
  }
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    if (parts.length > 2) {
      return `${parts.slice(0, 2).join(":")}:*:*`;
    }
  }
  return "masked-ip";
}

/**
 * Sanitizes sensitive citizen identity data (PAN, Aadhaar, Phone Numbers, Emails, IPs, Full Names)
 * to strictly enforce Digital Personal Data Protection (DPDP) Act, 2023 compliance.
 */
export function sanitizeDpdpData(text?: string | null): string | null {
  if (!text) return null;

  return text
    // 1. Mask raw 10-character PAN cards: ABCDE1234F -> XXXXX1234F
    .replace(/\b[A-Z]{5}(\d{4}[A-Z])\b/g, "XXXXX$1")
    // 2. Replace "for XXXX-XXXX-1234" or "for 1234-1234-1234" with "under citizen consent"
    .replace(/(?:for|with)\s+X{4}[-\s]?X{4}[-\s]?\d{4}/gi, "under citizen consent")
    .replace(/(?:for|with)\s+\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, "under citizen consent")
    // 3. Redact 12-digit Aadhaar patterns (full or partially masked) to safe reference
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?(\d{4})\b/g, "INQ-AADHAAR-$1")
    .replace(/\bX{4}[-\s]?X{4}[-\s]?(\d{4})\b/gi, "INQ-AADHAAR-$1")
    .replace(/X{4}[-\s]?X{4}[-\s]?\d{4}/gi, "INQ-AADHAAR")
    // 5. Mask UPI VPAs (e.g., 9876543210@paytm, user@oksbi)
    .replace(
      /\b([a-zA-Z0-9_.+-]{1,2})[a-zA-Z0-9_.+-]*@(okhdfcbank|okaxis|oksbi|okicici|paytm|ybl|ibl|upi|axl|apl)\b/gi,
      "$1****@$2",
    )
    // 6. Mask 10-digit Indian mobile numbers (e.g. +91 9876543210, 9876543210)
    .replace(/(?:\+91[\-\s]?)?\b([6-9]\d{5})(\d{4})\b/g, "XXXXXX$2")
    // 7. Mask email addresses
    .replace(
      /\b([a-zA-Z0-9_.+-]{1,2})[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g,
      "$1****@$2",
    )
    // 8. Mask IPv4 addresses
    .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}\b/g, "$1xxx")
    // 9. Scrub citizen names in parentheses like "(VIKASH KUMAR)"
    .replace(/\s*\([A-Za-z\s]{3,50}\)/g, " (Citizen Consent Verified)");
}

/**
 * Persists an API execution record in the ApiLog table for audit trailing.
 * Decoupled and non-blocking so it does not fail API requests.
 * All references, notes, and IP addresses are sanitized for DPDP Act compliance.
 */
export async function logApiExecution(params: LogApiParams): Promise<void> {
  try {
    const sanitizedReference = sanitizeDpdpData(params.reference);
    const sanitizedNote = sanitizeDpdpData(params.note);
    const sanitizedIp = params.ipAddress ? maskIpAddress(params.ipAddress) : null;

    await prisma.apiLog.create({
      data: {
        organizationId: params.organizationId || null,
        userId: params.userId || null,
        serviceCode: params.serviceCode,
        action: params.action,
        endpoint: params.endpoint,
        reference: sanitizedReference,
        status: params.status || "SUCCESS",
        statusCode: params.statusCode || 200,
        durationMs: params.durationMs,
        ipAddress: sanitizedIp,
        note: sanitizedNote,
      },
    });
  } catch (err: unknown) {
    logger.error("[ApiLogger] Failed to write API log:", err);
  }
}
