import { requestRepository } from "./request.repository.ts";
import { customerService } from "../customers/customer.service.ts";
import { serviceService } from "../services/service.service.ts";
import { pricingService } from "../pricing/pricing.service.ts";
import { paymentService } from "../payments/payment.service.ts";
import { serviceEngine } from "../engine/service-engine.ts";
import { AppError } from "../../core/errors/AppError.ts";
import { logger } from "../../core/logger/logger.ts";
import type {
  CreateRequestInput,
  ConfirmRequestPaymentInput,
  QueryRequestInput,
} from "./request.schema.ts";
import type { RequestContext } from "../../core/types/context.types.ts";

export class RequestService {
  async getRequestById(context: RequestContext, id: string) {
    const request = await requestRepository.findById(id);
    if (!request) {
      throw AppError.notFound(`Service request with ID ${id} not found`);
    }

    // Scoped Authorization Enforcement
    if (context.accessMode === "RETAILER") {
      if (!context.organizationId || request.organizationId !== context.organizationId) {
        throw AppError.forbidden("You do not have access to this service request");
      }
    } else {
      // Guest verification
      if (!context.guestSessionId || request.guestSessionId !== context.guestSessionId) {
        throw AppError.forbidden("Unauthorized guest session access");
      }
    }

    return request;
  }

  async queryRequests(context: RequestContext, query: QueryRequestInput) {
    if (context.accessMode !== "RETAILER" || !context.organizationId) {
      throw AppError.forbidden("Request history is only available for authenticated retailers");
    }
    return await requestRepository.findMany(context.organizationId, query);
  }

  /**
   * Initiates a Service Request, locks authoritative price, and generates a payment order.
   */
  async createRequest(context: RequestContext, data: CreateRequestInput) {
    // 1. Check idempotency first
    if (data.idempotencyKey) {
      const existing = await requestRepository.findByIdempotencyKey(data.idempotencyKey);
      if (existing) {
        logger.info(`Idempotent request matched for key: ${data.idempotencyKey}`);
        return existing;
      }
    }

    // 2. Validate Service exists & is active
    const service = await serviceService.getServiceByCode(data.serviceCode, context);
    if (!service.isActive) {
      throw AppError.badRequest(
        "Requested service is currently disabled",
        "SERVICE_DISABLED",
      );
    }

    // Check capability: isPublicAllowed
    if (context.accessMode === "GUEST" && !service.isPublicAllowed) {
      throw AppError.forbidden("This service requires retailer login", "AUTH_REQUIRED");
    }

    // Check capability: requiresCustomer
    if (context.accessMode === "RETAILER" && service.requiresCustomer && !data.customerId) {
      throw AppError.badRequest(
        "A customer profile must be selected for this service",
        "CUSTOMER_REQUIRED",
      );
    }

    // 3. Customer Authorization Check (BOLA Protection)
    let validatedCustomerId: string | null = null;
    if (context.accessMode === "RETAILER" && data.customerId && context.organizationId) {
      const customer = await customerService.getCustomerById(
        data.customerId,
        context.organizationId,
      );
      validatedCustomerId = customer.id;
    }

    // 4. Calculate Authoritative Server Price Snapshot (Client price is ignored)
    const priceSnapshot = await pricingService.calculatePrice(
      service.id,
      context.pricingTier,
    );

    // 5. Generate Unique Reference Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = `REQ-${dateStr}-${service.code}-${randomSuffix}`;

    // 6. Create ServiceRequest Record in REQUEST_CREATED
    const request = await requestRepository.create({
      referenceNumber,
      serviceId: service.id,
      context,
      customerId: validatedCustomerId,
      amount: priceSnapshot.amount,
      currency: priceSnapshot.currency,
      inputData: data.input as Record<string, unknown>,
      idempotencyKey: data.idempotencyKey,
    });

    // 7. Generate Payment Order (Razorpay)
    const payment = await paymentService.createPaymentOrder(
      context,
      request.id,
      priceSnapshot.amount,
      priceSnapshot.currency,
    );

    // 8. Transition status to PRICE_LOCKED & PAYMENT_PENDING
    const lockedRequest = await requestRepository.updateStatus(
      request.id,
      "PAYMENT_PENDING",
      `Price locked at ₹${priceSnapshot.amount} (${priceSnapshot.pricingTier}). Awaiting payment confirmation.`,
    );

    return {
      ...lockedRequest,
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        gatewayOrderId: payment.gatewayOrderId,
        method: payment.method,
        status: payment.status,
      },
    };
  }

  /**
   * Confirms payment capture and executes the service engine workflow.
   */
  async confirmPaymentAndExecute(
    context: RequestContext,
    requestId: string,
    verification: ConfirmRequestPaymentInput,
  ) {
    // 1. Fetch & authorize access to request
    const request = await this.getRequestById(context, requestId);

    if (request.status === "COMPLETED") {
      logger.info(`Request ${requestId} already completed.`);
      return request;
    }

    // 2. Verify and Capture Payment
    await paymentService.verifyAndCapture(
      verification.paymentId,
      verification.gatewayPaymentId,
      verification.gatewaySignature,
    );

    // 3. Transition to PAYMENT_CAPTURED ➔ PROCESSING
    await requestRepository.updateStatus(
      requestId,
      "PAYMENT_CAPTURED",
      "Payment successfully verified and captured.",
    );

    await requestRepository.updateStatus(
      requestId,
      "PROCESSING",
      "Dispatching request to service provider gateway.",
    );

    // 4. Execute Service Workflow through Provider Gateway
    try {
      const result = await serviceEngine.executeService(
        request.service.code,
        request.inputData as Record<string, unknown>,
      );

      if (result.success) {
        // Success: Store Result & Transition to COMPLETED
        await requestRepository.updateResult(
          requestId,
          result.resultData || {},
          result.providerId,
          result.referenceNumber,
        );

        const completedRequest = await requestRepository.updateStatus(
          requestId,
          "COMPLETED",
          `Service completed successfully via ${result.providerId}.`,
        );

        return completedRequest;
      } else {
        // Provider Logic Failure (e.g. Identity Not Found)
        await requestRepository.updateResult(
          requestId,
          { error: result.error },
          result.providerId,
        );

        const failedRequest = await requestRepository.updateStatus(
          requestId,
          "PROVIDER_FAILED",
          `Provider execution failed: ${result.error}`,
        );

        return failedRequest;
      }
    } catch (error) {
      logger.error(`Execution error for Request ID ${requestId}:`, error);

      await requestRepository.updateResult(requestId, {
        error: "Internal integration gateway failure or timeout",
      });

      const failedRequest = await requestRepository.updateStatus(
        requestId,
        "PROVIDER_FAILED",
        "Integration gateway timeout. Payment captured; eligible for retry or refund.",
      );

      return failedRequest;
    }
  }
}

export const requestService = new RequestService();
