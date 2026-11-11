import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { rcService } from "./rc.service";
import { logApiExecution } from "../../core/logger/api-logger";
import {
  type RcDetailsInput,
  rcDetailsSchema,
  type VerifyRcInput,
  verifyRcSchema,
  type MobileToRcInput,
  mobileToRcSchema,
  type RcOwnerHistoryInput,
  rcOwnerHistorySchema,
} from "./rc.schema";
import type { ContextVariables } from "../../app/context";

export const rcRoutes = new Hono<ContextVariables>();

/**
 * 1. Verify Vehicle Registration Status (Pre-Check)
 * POST /rc/verify
 */
rcRoutes.post(
  "/verify",
  validationMiddleware(verifyRcSchema),
  async (c) => {
    const { vehicleNumber } = c.get("validData") as VerifyRcInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    const cleanNo = vehicleNumber.replace(/[\s\-_]/g, "").toUpperCase();
    const isMockTest = cleanNo === "DL01AB1234";

    try {
      const result = await rcService.verifyRc(vehicleNumber);
      if (!isMockTest) {
        logApiExecution({
          organizationId: orgId,
          userId: user?.id,
          serviceCode: "VEHICLE_LOOKUP",
          action: "Vehicle Registration Pre-Verification",
          endpoint: "/api/v1/rc/verify",
          reference: result.vehicleNumber,
          status: "SUCCESS",
          statusCode: 200,
          durationMs: Date.now() - start,
          note: `RC pre-verification executed. Masked Owner: ${result.ownerNameMasked}`,
        });
      }
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Vehicle record not found";
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
        serviceCode: "VEHICLE_LOOKUP",
        action: "Vehicle Registration Pre-Verification",
        endpoint: "/api/v1/rc/verify",
        reference: vehicleNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Vehicle RC pre-verification failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);

/**
 * 2. Get Comprehensive RC Full Details
 * POST /rc/details
 */
rcRoutes.post(
  "/details",
  validationMiddleware(rcDetailsSchema),
  async (c) => {
    const { vehicleNumber } = c.get("validData") as RcDetailsInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    const cleanNo = vehicleNumber.replace(/[\s\-_]/g, "").toUpperCase();
    const isMockTest = cleanNo === "DL01AB1234";

    try {
      const result = await rcService.getRcDetails(vehicleNumber);
      if (!isMockTest) {
        logApiExecution({
          organizationId: orgId,
          userId: user?.id,
          serviceCode: "VEHICLE_LOOKUP",
          action: "Comprehensive RC Full Details Inquiry",
          endpoint: "/api/v1/rc/details",
          reference: result.rc_number,
          status: "SUCCESS",
          statusCode: 200,
          durationMs: Date.now() - start,
          note: `RC full details retrieved for ${result.rc_number} (${result.maker_model})`,
        });
      }
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Vehicle details lookup failed";
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
        serviceCode: "VEHICLE_LOOKUP",
        action: "Comprehensive RC Full Details Inquiry",
        endpoint: "/api/v1/rc/details",
        reference: vehicleNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Vehicle RC details inquiry failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);

/**
 * 3. Mobile To RC Pre-Check
 * POST /rc/mobile/verify
 */
rcRoutes.post(
  "/mobile/verify",
  validationMiddleware(mobileToRcSchema),
  async (c) => {
    const { mobileNumber } = c.get("validData") as MobileToRcInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await rcService.verifyMobileToRc(mobileNumber);
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "MOBILE_TO_RC",
        action: "Mobile to RC Pre-Check",
        endpoint: "/api/v1/rc/mobile/verify",
        reference: mobileNumber,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Mobile to RC pre-check: ${result.vehicleCount} vehicles found`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No vehicle records found for this mobile";
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
        serviceCode: "MOBILE_TO_RC",
        action: "Mobile to RC Pre-Check",
        endpoint: "/api/v1/rc/mobile/verify",
        reference: mobileNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Mobile to RC pre-check failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);

/**
 * 4. Fetch Full Mobile to RC list
 * POST /rc/mobile/details
 */
rcRoutes.post(
  "/mobile/details",
  validationMiddleware(mobileToRcSchema),
  async (c) => {
    const { mobileNumber } = c.get("validData") as MobileToRcInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await rcService.getMobileToRc(mobileNumber);
      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "MOBILE_TO_RC",
        action: "Mobile to RC Fetch",
        endpoint: "/api/v1/rc/mobile/details",
        reference: mobileNumber,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `Mobile to RC returned ${result.rc_number.length} vehicles`,
      });
      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retrieve vehicles";
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
        serviceCode: "MOBILE_TO_RC",
        action: "Mobile to RC Fetch",
        endpoint: "/api/v1/rc/mobile/details",
        reference: mobileNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `Mobile to RC fetch failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);

/**
 * 5. RC Owner History Details
 * POST /rc/owner-history
 */
rcRoutes.post(
  "/owner-history",
  validationMiddleware(rcOwnerHistorySchema),
  async (c) => {
    const { vehicleNumber } = c.get("validData") as RcOwnerHistoryInput;
    const orgId = c.get("organizationId");
    const user = c.get("user");
    const start = Date.now();

    try {
      const result = await rcService.getRcOwnerHistory(vehicleNumber);

      logApiExecution({
        organizationId: orgId,
        userId: user?.id,
        serviceCode: "RC_OWNER_HISTORY",
        action: "RC Owner History Inquiry",
        endpoint: "/api/v1/rc/owner-history",
        reference: vehicleNumber,
        status: "SUCCESS",
        statusCode: 200,
        durationMs: Date.now() - start,
        note: `RC owner history retrieved: Owner #${result.current_owner_number} (${result.current_owner_name})`,
      });

      return c.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to retrieve vehicle owner history";
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
        serviceCode: "RC_OWNER_HISTORY",
        action: "RC Owner History Inquiry",
        endpoint: "/api/v1/rc/owner-history",
        reference: vehicleNumber,
        status: "FAILED",
        statusCode,
        durationMs: Date.now() - start,
        note: `RC owner history inquiry failed: ${msg}`,
      });

      return c.json({ success: false, message: msg }, statusCode as any);
    }
  }
);
