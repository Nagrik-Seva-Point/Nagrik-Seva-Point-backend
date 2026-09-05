import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { requestService } from "./request.service";
import { requestRepository } from "./request.repository";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { AppError } from "../../core/errors/AppError";
import {
  type ConfirmRequestPaymentInput,
  confirmRequestPaymentSchema,
  type CreateRequestInput,
  createRequestSchema,
  type QueryRequestInput,
  queryRequestSchema,
} from "./request.schema";
import type { ContextVariables } from "../../app/context";

export const requestRoutes = new Hono<ContextVariables>();

// 1. Unified Initiate Service Request (Guest & Retailer)
requestRoutes.post(
  "/",
  validationMiddleware(createRequestSchema),
  async (c) => {
    const context = c.get("requestContext");
    const data = c.get("validData") as CreateRequestInput;

    const result = await requestService.createRequest(context, data);
    return c.json({ success: true, data: result });
  },
);


// 3. Get Request by ID (Scoped by context)
requestRoutes.get("/:id", async (c) => {
  const context = c.get("requestContext");
  const id = c.req.param("id");

  const result = await requestService.getRequestById(context, id);
  return c.json({ success: true, data: result });
});

// 4. Store Gzip-Compressed + AES-256 Encrypted PDF in 24-Hour Ephemeral Redis Vault
requestRoutes.post("/:id/store-pdf", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const pdfBase64 = body.pdfBase64;

  if (!pdfBase64) {
    return c.json({ success: false, message: "pdfBase64 is required" }, 400);
  }

  const stored = await ephemeralVault.storePdfVaultItem(id, pdfBase64);
  return c.json({ success: stored, message: stored ? "PDF stored in 24h vault" : "Failed to store PDF" });
});

// 5. Download 24-Hour Ephemeral PDF (Retailer-Only Feature)
requestRoutes.get("/:id/download-pdf", async (c) => {
  const context = c.get("requestContext");

  // Enforce Retailer authentication - Public / Guest cannot access 24h persistent vault download
  if (context.accessMode !== "RETAILER" && !context.userId) {
    throw AppError.forbidden(
      "24-Hour PDF vault download is an exclusive feature for registered retailers. Please login to your retailer account.",
      "RETAILER_AUTH_REQUIRED",
    );
  }

  const id = c.req.param("id");

  // Verify request existence & organization authorization
  const request = await requestRepository.findById(id);
  if (!request) {
    throw AppError.notFound("Service request not found.");
  }

  if (context.organizationId && request.organizationId && request.organizationId !== context.organizationId) {
    throw AppError.forbidden("You do not have access to this service request.");
  }

  // Verify payment completion
  const isPaid = ["COMPLETED", "SUCCESS", "PAYMENT_CAPTURED"].includes(request.status);
  if (!isPaid) {
    throw AppError.badRequest(
      `Download unavailable: Payment is ${request.status}. Please complete payment first.`,
      "PAYMENT_NOT_COMPLETED",
    );
  }

  const pdfData = await ephemeralVault.getPdfVaultItem(id);

  if (!pdfData.buffer || pdfData.isExpired) {
    return c.json(
      {
        success: false,
        message: "This 24-hour temporary PDF download session has expired or was not found in the vault.",
      },
      410,
    );
  }

  return new Response(pdfData.buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Kisan_Card_${id}.pdf"`,
      "Content-Length": String(pdfData.buffer.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
});

// 6. Query Request History (Retailer only)
requestRoutes.get(
  "/",
  validationMiddleware(queryRequestSchema, "query"),
  async (c) => {
    const context = c.get("requestContext");
    const query = c.get("validData") as QueryRequestInput;

    const result = await requestService.queryRequests(context, query);
    return c.json({ success: true, ...result });
  },
);
