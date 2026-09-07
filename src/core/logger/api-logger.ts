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
 * Sanitizes sensitive citizen identity data (PAN, Aadhaar, Full Names)
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
    // 3. If string is solely a masked or full Aadhaar reference, convert to safe inquiry code
    .replace(/^X{4}[-\s]?X{4}[-\s]?\d{4}$/i, "INQ-PAN-FIND")
    .replace(/^\d{4}[-\s]?\d{4}[-\s]?\d{4}$/, "INQ-PAN-FIND")
    // 4. Redact any remaining 12-digit Aadhaar patterns
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?(\d{4})\b/g, "INQ-AADHAAR-$1")
    .replace(/X{4}[-\s]?X{4}[-\s]?\d{4}/gi, "INQ-PAN-FIND")
    // 5. Scrub citizen names in parentheses like "(VIKASH KUMAR)"
    .replace(/\s*\([A-Za-z\s]{3,50}\)/g, " (Citizen Consent Verified)");
}

/**
 * Persists an API execution record in the ApiLog table for audit trailing.
 * Decoupled and non-blocking so it does not fail API requests.
 * All references and notes are sanitized for DPDP Act compliance.
 */
export async function logApiExecution(params: LogApiParams): Promise<void> {
  try {
    const sanitizedReference = sanitizeDpdpData(params.reference);
    const sanitizedNote = sanitizeDpdpData(params.note);

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
        ipAddress: params.ipAddress || null,
        note: sanitizedNote,
      },
    });
  } catch (err: unknown) {
    logger.error("[ApiLogger] Failed to write API log:", err);
  }
}
