import { requestRepository } from "./request.repository";
import { customerService } from "../customers/customer.service";
import { serviceService } from "../services/service.service";
import { pricingService } from "../pricing/pricing.service";
import { paymentService } from "../payment/payment.service";
import { serviceEngine } from "../engine/service-engine";
import { prisma } from "../../core/db/prisma";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
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

    // Fetch in-memory 24-hour vault item
    const vault = await ephemeralVault.getVaultItem(request.id);

    return {
      ...request,
      vaultData: vault.data,
      vaultInfo: {
        isExpired: vault.isExpired,
        remainingTtlSeconds: vault.remainingTtlSeconds,
        expiresAt: vault.expiresAt,
      },
    };
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

    // 3. Customer Authorization Check (BOLA Protection) & User Identity Resolution
    let validatedCustomerId: string | null = null;
    let customerName = "Citizen Applicant";
    let customerEmail = "citizen@nagriksevapoint.in";
    let customerPhone = "9876543210";

    const rawInput = (data.input || {}) as Record<string, any>;
    if (rawInput.phone || rawInput.customerPhone || rawInput.mobile) {
      const p = String(rawInput.phone || rawInput.customerPhone || rawInput.mobile).replace(/[^0-9]/g, "").slice(-10);
      if (p.length === 10) customerPhone = p;
    }
    if (rawInput.name || rawInput.customerName || rawInput.fullName) {
      customerName = String(rawInput.name || rawInput.customerName || rawInput.fullName);
    }
    if (rawInput.email || rawInput.customerEmail) {
      customerEmail = String(rawInput.email || rawInput.customerEmail);
    }

    // Fetch Authenticated Retailer User details from DB
    if (context.userId) {
      const user = await prisma.user.findUnique({ where: { id: context.userId } });
      if (user) {
        if (user.name) customerName = user.name;
        if (user.email) customerEmail = user.email;
        if (user.phone) {
          const p = user.phone.replace(/[^0-9]/g, "").slice(-10);
          if (p.length === 10) customerPhone = p;
        }
      }
    }

    // Validate Selected Customer Profile if provided
    if (
      context.accessMode === "RETAILER" && data.customerId &&
      context.organizationId
    ) {
      const customer = await customerService.getCustomerById(
        data.customerId,
        context.organizationId,
      );
      validatedCustomerId = customer.id;
      if (customer.phone && customerPhone === "9876543210") {
        const p = customer.phone.replace(/[^0-9]/g, "").slice(-10);
        if (p.length === 10) customerPhone = p;
      }
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

    // 6. Create ServiceRequest Record in REQUEST_CREATED (Zero user input stored in DB)
    const request = await requestRepository.create({
      referenceNumber,
      serviceId: service.id,
      context,
      customerId: validatedCustomerId,
      amount: priceSnapshot.amount,
      currency: priceSnapshot.currency,
      inputData: {},
      idempotencyKey: data.idempotencyKey,
    });

    // Stash ephemeral search token in Redis with 30-min TTL (Zero DB storage)
    if (rawInput.searchToken || rawInput.pan) {
      await ephemeralVault.stashTempSearchToken(
        request.id,
        rawInput.searchToken || rawInput.pan,
      );
    }

    // 7. Generate Payment Order (Cashfree) with Service Description
    const serviceName = service.name || "PAN Find Service";
    const orderNote = `${serviceName} (Ref: ${referenceNumber})`;

    const paymentSession = await paymentService.createCashfreeOrderFromRequest(
      request,
      context.userId || null,
      context.guestSessionId || null,
      customerName,
      customerEmail,
      customerPhone,
      orderNote,
      {
        service_code: service.code,
        reference_number: referenceNumber,
        access_mode: context.accessMode || "RETAILER",
      }
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
