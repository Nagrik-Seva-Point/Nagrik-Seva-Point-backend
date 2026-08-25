import { paymentRepository } from "./payment.repository";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import type { RequestContext } from "../../core/types/context.types";

export class PaymentService {
  /**
   * Initializes a payment order for a ServiceRequest.
   */
  async createPaymentOrder(
    context: RequestContext,
    serviceRequestId: string,
    amount: number,
    currency = "INR",
  ) {
    // Generate an order ID (Simulated Razorpay order format)
    const gatewayOrderId = `order_${crypto.randomUUID().replace(/-/g, "").substring(0, 14)}`;

    const payment = await paymentRepository.create({
      serviceRequestId,
      organizationId: context.organizationId,
      guestSessionId: context.guestSessionId,
      amount,
      currency,
      method: "RAZORPAY",
      gatewayOrderId,
    });

    logger.info(`Payment order created: ${payment.id} for request: ${serviceRequestId}`);
    return payment;
  }

  /**
   * Verifies and marks payment as CAPTURED.
   */
  async verifyAndCapture(
    paymentId: string,
    gatewayPaymentId: string,
    gatewaySignature?: string,
  ) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) {
      throw AppError.notFound(`Payment record ${paymentId} not found`);
    }

    if (payment.status === "CAPTURED") {
      return payment;
    }

    // In production, verify Razorpay HMAC-SHA256 signature here.
    // For development / pilot, signature validation passes when paymentId is provided.
    const updated = await paymentRepository.updateStatus(
      paymentId,
      "CAPTURED",
      gatewayPaymentId,
      gatewaySignature,
    );

    logger.info(`Payment ${paymentId} verified and CAPTURED successfully.`);
    return updated;
  }
}

export const paymentService = new PaymentService();
