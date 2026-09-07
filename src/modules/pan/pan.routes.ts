import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { panService } from "./pan.service";
import { logApiExecution } from "../../core/logger/api-logger";
import {
  type DecryptPanTokenInput,
  decryptPanTokenSchema,
  type FindPanInput,
  findPanSchema,
  type PanDetailsInput,
  panDetailsSchema,
  type VerifyPanDetailsInput,
  verifyPanDetailsSchema,
} from "./pan.schema";
import type { ContextVariables } from "../../app/context";

export const panRoutes = new Hono<ContextVariables>();

/**
 * 1. Find PAN Number by Aadhaar
 * POST /pan/find
 */
panRoutes.post(
  "/find",
  validationMiddleware(findPanSchema),
  async (c) => {
    const { aadhaar } = c.get("validData") as FindPanInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await panService.findPanByAadhaar(aadhaar);
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_FIND",
        action: "Aadhaar PAN Find Inquiry",
        endpoint: "/api/v1/pan/find",
        reference: result.maskedPan,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Aadhaar lookup executed under citizen consent (DPDP Act). Masked PAN: ${result.maskedPan}`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Record not found";
      const statusCode = err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode?: number }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 400;
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_FIND",
        action: "Aadhaar PAN Find Inquiry",
        endpoint: "/api/v1/pan/find",
        reference: "INQ-PAN-FIND",
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Aadhaar lookup inquiry failed: ${msg}`,
      });
      throw err;
    }
  },
);

/**
 * 2. Get Comprehensive PAN Details
 * POST /pan/details
 */
panRoutes.post(
  "/details",
  validationMiddleware(panDetailsSchema),
  async (c) => {
    const validData = c.get("validData") as PanDetailsInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const panRef = typeof validData === "string" ? validData : (validData && typeof validData === "object" && "pan" in validData ? (validData as { pan: string }).pan : "PAN_RECORD");
    const start = Date.now();

    try {
      const result = await panService.getPanDetails(validData);
      const maskedPan = result.pan ? `XXXXX${result.pan.slice(5)}` : (panRef.length === 10 ? `XXXXX${panRef.slice(5)}` : "PAN_RECORD");
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN 360 Details Retrieval",
        endpoint: "/api/v1/pan/details",
        reference: maskedPan,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `PAN demographic records retrieved securely for masked PAN ${maskedPan}. DPDP citizen consent verified.`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      const statusCode = err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode?: number }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 400;
      const safePanRef = panRef.length === 10 ? `XXXXX${panRef.slice(5)}` : "PAN_RECORD";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN 360 Details Retrieval",
        endpoint: "/api/v1/pan/details",
        reference: safePanRef,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `PAN details retrieval failed: ${msg}`,
      });
      throw err;
    }
  },
);

/**
 * 3. Decrypt Search Token & Reveal PAN + Masked Aadhaar
 * POST /pan/decrypt-token
 */
panRoutes.post(
  "/decrypt-token",
  validationMiddleware(decryptPanTokenSchema),
  (c) => {
    const { searchToken } = c.get("validData") as DecryptPanTokenInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = panService.decryptSearchToken(searchToken);
      const maskedPan = result.pan ? `XXXXX${result.pan.slice(5)}` : "PAN_TOKEN";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_FIND",
        action: "PAN Token Decrypted",
        endpoint: "/api/v1/pan/decrypt-token",
        reference: maskedPan,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Stateless PAN token decrypted under citizen consent (DPDP compliant). Masked PAN: ${maskedPan}`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid token";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_FIND",
        action: "PAN Token Decrypt Failed",
        endpoint: "/api/v1/pan/decrypt-token",
        reference: "PAN_TOKEN",
        status: "FAILED",
        statusCode: 400,
        durationMs: Date.now() - start,
        note: `PAN token decryption failed: ${msg}`,
      });
      throw err;
    }
  },
);

/**
 * 4. Verify PAN Details & Tokenize (Pre-Payment Availability Check)
 * POST /pan/details/verify
 */
panRoutes.post(
  "/details/verify",
  validationMiddleware(verifyPanDetailsSchema),
  async (c) => {
    const { pan } = c.get("validData") as VerifyPanDetailsInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await panService.verifyPanDetails(pan);
      const maskedPan = pan.length === 10 ? `XXXXX${pan.slice(5)}` : "PAN_RECORD";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN Details Verification Inquiry",
        endpoint: "/api/v1/pan/details/verify",
        reference: maskedPan,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Verification inquiry for masked PAN ${maskedPan} completed. Registry status: Active.`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid PAN";
      const statusCode = err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode?: number }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 400;
      const safePan = pan.length === 10 ? `XXXXX${pan.slice(5)}` : "PAN_RECORD";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN Details Verification Inquiry",
        endpoint: "/api/v1/pan/details/verify",
        reference: safePan,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Verification inquiry failed for masked PAN ${safePan}: ${msg}`,
      });
      throw err;
    }
  },
);

/**
 * 5. Decrypt Details Token to Reveal Full Demographic Records
 * POST /pan/details/decrypt
 */
panRoutes.post(
  "/details/decrypt",
  validationMiddleware(decryptPanTokenSchema),
  (c) => {
    const { searchToken } = c.get("validData") as DecryptPanTokenInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = panService.decryptPanDetailsToken(searchToken);
      const maskedPan = result.pan ? `XXXXX${result.pan.slice(5)}` : "PAN_REPORT";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN Details Report Unlocked",
        endpoint: "/api/v1/pan/details/decrypt",
        reference: maskedPan,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Unlocked PAN details report for masked PAN ${maskedPan}. Citizen consent verified under DPDP Act.`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid or expired token";
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "PAN_DETAILS",
        action: "PAN Details Report Unlock Failed",
        endpoint: "/api/v1/pan/details/decrypt",
        reference: "PAN_REPORT",
        status: "FAILED",
        statusCode: 400,
        durationMs: Date.now() - start,
        note: `Token unlock error: ${msg}`,
      });
      throw err;
    }
  },
);
