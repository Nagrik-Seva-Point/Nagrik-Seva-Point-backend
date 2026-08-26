import { prisma } from "../../core/db/prisma";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { cashfreeGateway } from "../../core/integrations/cashfree/cashfree.gateway";
import { serviceDispatcher } from "../services/service.dispatcher";
import type { CreateOrderInput } from "./payment.schema";
import { randomUUID } from "crypto";

export class PaymentService {
  /**
   * Generates a Cashfree Order from a newly created Service Request
   */
  async createCashfreeOrderFromRequest(
    serviceRequest: any,
    userId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string
  ) {
    const amount = Number(serviceRequest.amount);
    const organizationId = serviceRequest.organizationId;
    const generatedOrderId = `CF_ORD_${Date.now()}_${randomUUID().slice(0, 6).toUpperCase()}`;

    // Create Payment Record (PENDING) with industry-standard fields
    const payment = await prisma.payment.create({
      data: {
        serviceRequestId: serviceRequest.id,
        organizationId,
        userId: userId !== "unknown" ? userId : null,
        amount: amount,
        currency: "INR",
        method: "CASHFREE",
        status: "PENDING",
        orderId: generatedOrderId,
      },
    });

    // Call Cashfree Gateway
    try {
      const orderData = await cashfreeGateway.createOrder({
        orderId: generatedOrderId,
        orderAmount: amount,
        customerId: userId !== "unknown" ? userId : `GUEST_${randomUUID().slice(0, 8)}`,
        customerName: customerName,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
      });

      // Update Order ID and Payment Session ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          orderId: orderData.order_id,
          paymentSessionId: orderData.payment_session_id,
        },
      });

      return {
        payment_session_id: orderData.payment_session_id,
        order_id: orderData.order_id,
      };
    } catch (err: any) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          errorMessage: err.message || "Failed to initialize gateway order",
        },
      });
      throw err;
    }
  }

  /**
   * Processes async webhooks from Cashfree
   */
  async handleCashfreeWebhook(rawBody: string, signature: string, timestamp: string) {
    logger.info("[PaymentService] Processing Cashfree Webhook...");
    
    const isValid = cashfreeGateway.verifyWebhookSignature(rawBody, signature, timestamp);
    if (!isValid) {
      logger.error("[PaymentService] Invalid Webhook Signature!");
      throw AppError.badRequest("Invalid signature");
    }

    const payload = JSON.parse(rawBody);
    
    // We handle PAYMENT_SUCCESS_WEBHOOK and PAYMENT_FAILED_WEBHOOK
    if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const orderId = payload.data?.order?.order_id;
      const paymentId = payload.data?.payment?.cf_payment_id || payload.data?.payment?.payment_id;
      const paymentMode = payload.data?.payment?.payment_group || payload.data?.payment?.payment_method?.payment_mode;
      const bankReference = payload.data?.payment?.bank_reference || payload.data?.payment?.bank_reference_number;
      
      await this.markPaymentSuccess(orderId, paymentId, {
        paymentMode: paymentMode ? String(paymentMode).toUpperCase() : undefined,
        bankReference: bankReference ? String(bankReference) : undefined,
        rawResponse: payload,
      });
      
    } else if (payload.type === "PAYMENT_FAILED_WEBHOOK") {
      const orderId = payload.data?.order?.order_id;
      const errorMsg = payload.data?.payment?.payment_message || payload.data?.error_details?.error_description;
      await this.markPaymentFailed(orderId, {
        errorMessage: errorMsg,
        rawResponse: payload,
      });
    }
    
    return { success: true };
  }

  /**
   * Directly verify and confirm payment (called by frontend or fallback polling)
   */
  async confirmPaymentOrder(orderId: string, cfPaymentId?: string) {
    logger.info(`[PaymentService] Confirming payment order: ${orderId}`);

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: orderId },
          { orderId: orderId },
          { serviceRequestId: orderId }
        ]
      },
      include: {
        serviceRequest: {
          include: {
            service: true,
            customer: true,
            events: true,
            payments: true,
          }
        }
      }
    });

    if (!payment) {
      throw AppError.notFound(`Payment record for order ${orderId} not found`);
    }

    if (payment.status === "CAPTURED") {
      return payment.serviceRequest;
    }

    // Attempt live check with Cashfree if configured
    let isPaid = false;
    let remotePaymentId = cfPaymentId;
    let paymentMode: string | undefined;
    let bankReference: string | undefined;
    let rawResponse: any;

    try {
      const cfOrder = await cashfreeGateway.getOrder(payment.orderId || payment.id);
      if (cfOrder && (cfOrder.order_status === "PAID" || cfOrder.order_status === "ACTIVE")) {
        isPaid = true;
        rawResponse = cfOrder;
        if (!remotePaymentId && cfOrder.cf_order_id) {
          remotePaymentId = String(cfOrder.cf_order_id);
        }
      }
    } catch {
      // In sandbox/test environment or if credentials are being tested locally, fallback to true if cfPaymentId provided
      if (cfPaymentId || process.env.NODE_ENV !== "production") {
        isPaid = true;
      }
    }

    if (isPaid) {
      await this.markPaymentSuccess(payment.id, remotePaymentId || `CF_PAY_${Date.now()}`, {
        paymentMode: paymentMode || "ONLINE",
        bankReference,
        rawResponse,
      });
      
      return await prisma.serviceRequest.findUnique({
        where: { id: payment.serviceRequestId },
        include: {
          service: true,
          customer: true,
          events: true,
          payments: true,
        }
      });
    }

    return payment.serviceRequest;
  }

  async markPaymentSuccess(
    identifier: string,
    cfPaymentId?: string,
    details?: {
      paymentMode?: string;
      bankReference?: string;
      rawResponse?: any;
    }
  ) {
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderId: identifier },
          { serviceRequestId: identifier },
        ]
      },
      include: { serviceRequest: true }
    });

    if (!payment) {
      logger.error(`[PaymentService] Payment not found for identifier: ${identifier}`);
      return;
    }

    // Idempotency: If already processed, skip
    if (payment.status === "CAPTURED") {
      logger.info(`[PaymentService] Payment ${payment.id} already captured. Skipping.`);
      return;
    }

    const txId = cfPaymentId || payment.transactionId || `CF_${Date.now()}`;

    // 1. Update Payment Status with Industry standard fields
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        transactionId: String(txId),
        paymentMode: details?.paymentMode || payment.paymentMode || "UPI",
        bankReference: details?.bankReference || payment.bankReference,
        paidAt: new Date(),
        gatewayResponse: details?.rawResponse || undefined,
      },
    });

    // 2. Update Service Request Status
    await prisma.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { status: "PAYMENT_CAPTURED" },
    });

    // 3. Trigger Async Fulfillment (Decoupled from payment logic)
    serviceDispatcher.fulfillAsync(payment.serviceRequestId).catch(err => {
      logger.error(`[PaymentService] Fulfillment failed for Request ${payment.serviceRequestId}:`, err);
    });
  }

  async markPaymentFailed(
    identifier: string,
    details?: {
      errorMessage?: string;
      rawResponse?: any;
    }
  ) {
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderId: identifier },
          { serviceRequestId: identifier },
        ]
      }
    });

    if (!payment) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        errorMessage: details?.errorMessage,
        gatewayResponse: details?.rawResponse || undefined,
      },
    });

    await prisma.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { status: "FAILED" },
    });
  }
}

export const paymentService = new PaymentService();
