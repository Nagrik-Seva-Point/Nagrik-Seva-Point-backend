import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { dlService } from "./dl.service";
import { logApiExecution } from "../../core/logger/api-logger";
import {
  type DlDetailsInput,
  dlDetailsSchema,
  type VerifyDlInput,
  verifyDlSchema,
} from "./dl.schema";
import type { ContextVariables } from "../../app/context";

export const dlRoutes = new Hono<ContextVariables>();

/**
 * 1. Verify Driving License Status (Pre-Check)
 * POST /dl/verify
 */
dlRoutes.post(
  "/verify",
  validationMiddleware(verifyDlSchema),
  async (c) => {
    const { dlNumber, dob } = c.get("validData") as VerifyDlInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await dlService.verifyDl(dlNumber, dob);
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "DL_VERIFY",
        action: "Driving License Pre-Verification",
        endpoint: "/api/v1/dl/verify",
        reference: result.dlNumber,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `DL pre-verification executed. Masked Holder: ${result.holderNameMasked}`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Driving license record not found";
      const statusCode =
        err &&
        typeof err === "object" &&
        "statusCode" in err &&
        typeof (err as { statusCode?: number }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 400;

      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "DL_VERIFY",
        action: "Driving License Pre-Verification",
        endpoint: "/api/v1/dl/verify",
        reference: dlNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `DL pre-verification failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);

/**
 * 2. Get Comprehensive Driving License Full Details
 * POST /dl/details
 */
dlRoutes.post(
  "/details",
  validationMiddleware(dlDetailsSchema),
  async (c) => {
    const { dlNumber, dob } = c.get("validData") as DlDetailsInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await dlService.getDlDetails(dlNumber, dob);
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "DL_VERIFY",
        action: "Comprehensive Driving License Details Inquiry",
        endpoint: "/api/v1/dl/details",
        reference: result.license_number,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `DL full details retrieved for ${result.license_number} (${result.holder_name})`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Driving license details lookup failed";
      const statusCode =
        err &&
        typeof err === "object" &&
        "statusCode" in err &&
        typeof (err as { statusCode?: number }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 400;

      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "DL_VERIFY",
        action: "Comprehensive Driving License Details Inquiry",
        endpoint: "/api/v1/dl/details",
        reference: dlNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `DL full details inquiry failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);
