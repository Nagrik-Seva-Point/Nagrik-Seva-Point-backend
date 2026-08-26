import { requestRepository } from "./request.repository";
import { customerService } from "../customers/customer.service";
import { serviceService } from "../services/service.service";
import { pricingService } from "../pricing/pricing.service";
import { paymentService } from "../payment/payment.service";
import { serviceEngine } from "../engine/service-engine";
import { prisma } from "../../core/db/prisma";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import type {
  ConfirmRequestPaymentInput,
  CreateRequestInput,
  QueryRequestInput,
} from "./request.schema";
import type { RequestContext } from "../../core/types/context.types";

export class RequestService {
  async getRequestById(context: RequestContext, id: string) {
    const request = await requestRepository.findById(id);
    if (!request) {
      throw AppError.notFound(`Service request with ID ${id} not found`);
    }

    // Scoped Authorization Enforcement
    if (context.accessMode === "RETAILER") {
      if (
        !context.organizationId ||
        request.organizationId !== context.organizationId
      ) {
        throw AppError.forbidden(
          "You do not have access to this service request",
        );
      }
    } else {
      // Guest verification
      if (
        !context.guestSessionId ||
        request.guestSessionId !== context.guestSessionId
      ) {
        throw AppError.forbidden("Unauthorized guest session access");
      }
    }

    return request;
  }

  async queryRequests(context: RequestContext, query: QueryRequestInput) {
    if (context.accessMode !== "RETAILER" || !context.organizationId) {
      throw AppError.forbidden(
        "Request history is only available for authenticated retailers",
      );
    }
    return await requestRepository.findMany(context.organizationId, query);
  }

  /**
   * Initiates a Service Request, locks authoritative price, and generates a payment order.
   */
  async createRequest(context: RequestContext, data: CreateRequestInput) {
    // 1. Check idempotency first
    if (data.idempotencyKey) {
      const existing = await requestRepository.findByIdempotencyKey(
        data.idempotencyKey,
      );
      if (existing) {
        logger.info(
          `Idempotent request matched for key: ${data.idempotencyKey}`,
        );
        return existing;
      }
    }

    // 2. Validate Service exists & is active
    const service = await serviceService.getServiceByCode(
      data.serviceCode,
      context,
    );
    if (!service.isActive) {
      throw AppError.badRequest(
        "Requested service is currently disabled",
        "SERVICE_DISABLED",
      );
    }

    // Check capability: isPublicAllowed vs isRetailerAllowed
    if (context.accessMode === "GUEST" && !service.isPublicAllowed) {
      throw AppError.forbidden(
        "This service requires retailer login",
        "AUTH_REQUIRED",
      );
    }

    if (context.accessMode === "RETAILER" && !service.isRetailerAllowed) {
      throw AppError.forbidden(
        "This service is not available for retailer workspace",
        "SERVICE_NOT_ALLOWED",
      );
    }

    // Check capability: requiresCustomer
    if (
      context.accessMode === "RETAILER" && service.requiresCustomer &&
      !data.customerId
    ) {
      throw AppError.badRequest(
        "A customer profile must be selected for this service",
        "CUSTOMER_REQUIRED",
      );
    }

    // 3. Customer Authorization Check (BOLA Protection)
    let validatedCustomerId: string | null = null;
    if (
      context.accessMode === "RETAILER" && data.customerId &&
      context.organizationId
    ) {
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

    // 6.5 Fetch User for Cashfree
    let customerName = "Customer";
    let customerEmail = "customer@nagriksevapoint.in";
    let customerPhone = "9999999999";
    if (context.userId) {
      const user = await prisma.user.findUnique({ where: { id: context.userId } });
      if (user) {
        customerName = user.name || customerName;
        customerEmail = user.email || customerEmail;
        if ((user as any).phone) customerPhone = (user as any).phone;
      }
    }

    // 7. Generate Payment Order (Cashfree)
    const paymentSession = await paymentService.createCashfreeOrderFromRequest(
      request,
      context.userId || null,
      context.guestSessionId || null,
      customerName,
      customerEmail,
      customerPhone
    );

    // 8. Transition status to PRICE_LOCKED & PAYMENT_PENDING
    const lockedRequest = await requestRepository.updateStatus(
      request.id,
      "PAYMENT_PENDING",
      `Price locked at ₹${priceSnapshot.amount} (${priceSnapshot.pricingTier}). Awaiting Cashfree payment confirmation.`,
    );

    return {
      ...lockedRequest,
      payment: {
        payment_session_id: paymentSession.payment_session_id,
        order_id: paymentSession.order_id,
        mode: paymentSession.mode,
        amount: Number(priceSnapshot.amount),
        currency: priceSnapshot.currency,
      },
    };
  }
}

export const requestService = new RequestService();
