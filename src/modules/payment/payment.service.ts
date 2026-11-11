import { prisma } from "../../core/db/prisma";
import { redis } from "../../core/redis/redis.client";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { cashfreeGateway } from "../../core/integrations/cashfree/cashfree.gateway";
import { serviceDispatcher } from "../services/service.dispatcher";
import { sanitizeDpdpData } from "../../core/logger/api-logger";
import { randomUUID } from "crypto";
import { serviceService } from "../services/service.service";
import { pricingService } from "../pricing/pricing.service";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { paymentEmailService } from "../../core/mail/payment-email.service";
import type { RequestContext } from "../../core/types/context.types";

function sanitizeGatewayPayload(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  try {
    const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    
    // Scrub customer details if present in Cashfree webhook structure
    if (cloned.data && typeof cloned.data === "object") {
      const data = cloned.data as Record<string, unknown>;
      if (data.customer_details && typeof data.customer_details === "object") {
        const cust = data.customer_details as Record<string, unknown>;
        if (cust.customer_phone) cust.customer_phone = "XXXXXXXX" + String(cust.customer_phone).slice(-4);
        if (cust.customer_email) cust.customer_email = "citizen@masked.in";
        if (cust.customer_name) cust.customer_name = "Citizen Applicant";
      }
      if (data.payment && typeof data.payment === "object") {
        const pay = data.payment as Record<string, unknown>;
        if (pay.payment_method && typeof pay.payment_method === "object") {
          const pm = pay.payment_method as Record<string, unknown>;
          if (pm.upi && typeof pm.upi === "object") {
            const upi = pm.upi as Record<string, unknown>;
            if (upi.upi_id) upi.upi_id = "citizen****@upi";
          }
        }
      }
    }
    if (cloned.customer_details && typeof cloned.customer_details === "object") {
      const cust = cloned.customer_details as Record<string, unknown>;
      if (cust.customer_phone) cust.customer_phone = "XXXXXXXX" + String(cust.customer_phone).slice(-4);
      if (cust.customer_email) cust.customer_email = "citizen@masked.in";
      if (cust.customer_name) cust.customer_name = "Citizen Applicant";
    }

    return cloned;
  } catch {
    return undefined;
  }
}

export class PaymentService {
  /**
   * Generates a Cashfree Order from a newly created Service Request
   */
  async createCashfreeOrderFromRequest(
    serviceRequest: { id: string; amount: number | string; organizationId?: string | null },
    userId: string | null,
    guestSessionId: string | null,
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    orderNote?: string,
    orderTags?: Record<string, string>
  ) {
    const amount = Number(serviceRequest.amount);
    const organizationId = serviceRequest.organizationId || null;
    const generatedOrderId = `CF_ORD_${Date.now()}_${randomUUID().slice(0, 6).toUpperCase()}`;

    // Create Payment Record (PENDING) with industry-standard fields
    // NOTE: userId MUST be a real User ID from context.userId, or null for guests (foreign key constraint)
    const payment = await prisma.payment.create({
      data: {
        serviceRequestId: serviceRequest.id,
        organizationId,
        userId: userId || null,
        amount: amount,
        currency: "INR",
        method: "CASHFREE",
        status: "PENDING",
        orderId: generatedOrderId,
      },
    });

    // Determine Cashfree customerId (alphanumeric, underscore, hyphen, max 45 chars)
    const rawCustomerId = userId || guestSessionId || `GUEST_${randomUUID().slice(0, 8)}`;
    const cfCustomerId = rawCustomerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 45);

    // Call Cashfree Gateway
    try {
      const orderData = await cashfreeGateway.createOrder({
        orderId: generatedOrderId,
        orderAmount: amount,
        customerId: cfCustomerId,
        customerName: customerName,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
        orderNote,
        orderTags,
      });

      // Update Order ID and Payment Session ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          orderId: orderData.order_id,
          paymentSessionId: orderData.payment_session_id,
        },
      });

      const mode =
        process.env.CASHFREE_ENVIRONMENT ||
        ((process.env.CASHFREE_API_URL || "").includes("sandbox")
          ? "sandbox"
          : "production");

      return {
        payment_id: payment.id,
        payment_session_id: orderData.payment_session_id,
        order_id: orderData.order_id,
        mode,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          errorMessage: msg || "Failed to initialize gateway order",
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
    const paymentMode: string | undefined = undefined;
    const bankReference: string | undefined = undefined;
    let rawResponse: unknown;

    try {
      const cfOrder = await cashfreeGateway.getOrder(payment.orderId || payment.id);
      if (cfOrder) {
        if (cfOrder.order_status === "PAID") {
          isPaid = true;
          rawResponse = cfOrder;
          if (!remotePaymentId && cfOrder.cf_order_id) {
            remotePaymentId = String(cfOrder.cf_order_id);
          }
        } else {
          const pList = await cashfreeGateway.getOrderPayments(payment.orderId || payment.id).catch(() => []);
          const succ = pList.find((p: any) => String(p.payment_status).toUpperCase() === "SUCCESS");
          if (succ) {
            isPaid = true;
            rawResponse = { order: cfOrder, payment: succ };
            if (succ.cf_payment_id) remotePaymentId = String(succ.cf_payment_id);
          }
        }
      }
    } catch {
      // In sandbox/test environment or if credentials are being tested locally, fallback to true if cfPaymentId provided
      if (cfPaymentId && process.env.NODE_ENV !== "production") {
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

  /**
   * Admin-triggered on-demand synchronization with Cashfree Payment Gateway.
   * Strictly verifies order payment status and amount with Cashfree before marking as CAPTURED.
   * If Cashfree reports FAILED / EXPIRED / USER_DROPPED, marks payment as FAILED without crediting wallet.
   */
  async syncCashfreePayment(identifier: string, performedByUserId?: string) {
    logger.info(`[PaymentService] Syncing Cashfree payment status for identifier: ${identifier} by admin: ${performedByUserId || "system"}`);

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderId: identifier },
          { serviceRequestId: identifier },
        ],
      },
      include: {
        serviceRequest: {
          include: { service: true },
        },
      },
    });

    if (!payment) {
      throw AppError.notFound(`Payment record not found for: ${identifier}`);
    }

    // Guard: Only Cashfree payments can be synced with Cashfree
    if (payment.method !== "CASHFREE") {
      throw AppError.badRequest(`Payment method is ${payment.method}, not CASHFREE. Cannot sync with Cashfree gateway.`);
    }

    // Guard: Idempotency check - if already CAPTURED
    if (payment.status === "CAPTURED") {
      return {
        success: true,
        status: "CAPTURED",
        alreadyProcessed: true,
        message: `Transaction is already CAPTURED and credited. (Txn ID: ${payment.transactionId || "N/A"})`,
        payment: {
          id: payment.id,
          orderId: payment.orderId,
          amount: Number(payment.amount),
          status: payment.status,
          paymentMode: payment.paymentMode,
          bankReference: payment.bankReference,
          transactionId: payment.transactionId,
          paidAt: payment.paidAt,
        },
      };
    }

    const cfOrderId = payment.orderId;
    if (!cfOrderId) {
      throw AppError.badRequest(`Missing Cashfree orderId for payment: ${payment.id}`);
    }

    // Query Cashfree API directly
    let cfOrder: any;
    try {
      cfOrder = await cashfreeGateway.getOrder(cfOrderId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PaymentService] Failed to fetch order from Cashfree: ${msg}`);
      throw AppError.badRequest(`Cashfree gateway error: ${msg}`);
    }

    if (!cfOrder) {
      throw AppError.badRequest(`Cashfree did not return order details for: ${cfOrderId}`);
    }

    const orderStatus = String(cfOrder.order_status || "").toUpperCase();
    const gatewayAmount = Number(cfOrder.order_amount);
    const recordedAmount = Number(payment.amount);

    // Fetch individual payment attempts from Cashfree
    const paymentsList = await cashfreeGateway.getOrderPayments(cfOrderId).catch(() => []);
    const successfulPayment = paymentsList.find((p: any) => String(p.payment_status).toUpperCase() === "SUCCESS");

    // Case 1: Cashfree confirms payment was SUCCESSFUL (PAID order or verified SUCCESS payment record)
    if (orderStatus === "PAID" || successfulPayment) {
      // Amount verification guard against tampering
      if (Math.abs(gatewayAmount - recordedAmount) > 0.01) {
        logger.error(`[PaymentService] Security mismatch: Cashfree amount ₹${gatewayAmount} != DB amount ₹${recordedAmount}`);
        throw AppError.badRequest(
          `Amount mismatch: Gateway reported ₹${gatewayAmount}, but database recorded ₹${recordedAmount}. Refusing auto-credit.`
        );
      }

      const cfPaymentId = successfulPayment?.cf_payment_id
        ? String(successfulPayment.cf_payment_id)
        : (cfOrder.cf_order_id ? String(cfOrder.cf_order_id) : `CF_${Date.now()}`);

      const paymentMode = (
        successfulPayment?.payment_group ||
        successfulPayment?.payment_method?.payment_mode ||
        payment.paymentMode ||
        "UPI"
      ).toUpperCase();

      const bankReference = successfulPayment?.bank_reference || successfulPayment?.bank_reference_number || undefined;

      // Mark payment success, credit wallet, and update request status
      await this.markPaymentSuccess(payment.id, cfPaymentId, {
        paymentMode,
        bankReference,
        rawResponse: {
          syncedBy: performedByUserId || "ADMIN_SYNC",
          syncedAt: new Date().toISOString(),
          order: cfOrder,
          payments: paymentsList,
        },
      });

      return {
        success: true,
        status: "CAPTURED",
        message: `Payment verified as PAID on Cashfree. ₹${recordedAmount.toFixed(2)} credited successfully. Gateway Txn: ${cfPaymentId}`,
        payment: {
          id: payment.id,
          orderId: payment.orderId,
          amount: recordedAmount,
          status: "CAPTURED",
          paymentMode,
          bankReference,
          transactionId: cfPaymentId,
        },
      };
    }

    // Case 2: Cashfree reports order/payment FAILED, CANCELLED, EXPIRED, TERMINATED, or USER_DROPPED
    if (["FAILED", "EXPIRED", "TERMINATED", "CANCELLED", "USER_DROPPED"].includes(orderStatus)) {
      const errorMsg = `Cashfree reported order as ${orderStatus}`;
      await this.markPaymentFailed(payment.id, {
        errorMessage: errorMsg,
        rawResponse: {
          syncedBy: performedByUserId || "ADMIN_SYNC",
          syncedAt: new Date().toISOString(),
          order: cfOrder,
          payments: paymentsList,
        },
      });

      return {
        success: true,
        status: "FAILED",
        message: `Order verified as ${orderStatus} on Cashfree. Payment marked as FAILED. Wallet was NOT credited.`,
        payment: {
          id: payment.id,
          orderId: payment.orderId,
          amount: recordedAmount,
          status: "FAILED",
          errorMessage: errorMsg,
        },
      };
    }

    // Case 3: Order is still ACTIVE / PENDING without successful payment
    return {
      success: true,
      status: "PENDING",
      message: `Order is still ACTIVE/PENDING on Cashfree. Customer has not completed payment yet. No changes made.`,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        amount: recordedAmount,
        status: "PENDING",
      },
    };
  }

  async markPaymentSuccess(
    identifier: string,
    cfPaymentId?: string,
    details?: {
      paymentMode?: string;
      bankReference?: string;
      rawResponse?: unknown;
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
      include: {
        serviceRequest: {
          include: { service: true },
        },
      },
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
        gatewayResponse: sanitizeGatewayPayload(details?.rawResponse) as object | undefined,
      },
    });

    // 2. Update Service Request Status & log event
    await prisma.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { status: "PAYMENT_CAPTURED" },
    });

    await prisma.serviceRequestEvent.create({
      data: {
        serviceRequestId: payment.serviceRequestId,
        status: "PAYMENT_CAPTURED",
        note: `Payment of ₹${Number(payment.amount).toFixed(2)} captured via Cashfree (${details?.paymentMode || payment.paymentMode || "UPI"}). Gateway Txn: ${txId}`,
      },
    });

    // Invalidate request and audit caches
    if (payment.organizationId) {
      redis.delPattern(`cache:requests:query:${payment.organizationId}:*`).catch(() => {});
    }
    redis.delPattern("cache:audit-logs:*").catch(() => {});

    // 3. Trigger Fulfillment
    try {
      await serviceDispatcher.fulfillAsync(payment.serviceRequestId);
    } catch (err) {
      logger.error(`[PaymentService] Fulfillment failed for Request ${payment.serviceRequestId}:`, err);
    }

    // 4. Trigger Payment Success Email Notification
    try {
      let recipientEmail = "operator@nagriksevapoint.in";
      let recipientName = "Operator";
      let resolvedOrgName: string | undefined = undefined;
      let newBalance: number | undefined = undefined;

      if (payment.userId) {
        const u = await prisma.user.findUnique({
          where: { id: payment.userId },
          include: {
            members: {
              include: {
                organization: {
                  include: { wallet: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });
        if (u?.email) recipientEmail = u.email;
        if (u?.name) recipientName = u.name;

        const primaryMember = u?.members?.[0];
        if (primaryMember?.organization) {
          resolvedOrgName = primaryMember.organization.name;
          if (primaryMember.organization.wallet) {
            newBalance = Number(primaryMember.organization.wallet.balance);
          }
        }
      }

      const orgId = payment.organizationId || payment.serviceRequest?.organizationId;
      if (orgId) {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          include: { wallet: true },
        });
        if (org?.name) {
          resolvedOrgName = org.name;
        }
        if (org?.wallet) {
          newBalance = Number(org.wallet.balance);
        }
      }

      if (!resolvedOrgName && payment.serviceRequest?.inputData) {
        const input = payment.serviceRequest.inputData as any;
        if (input?.orgName && typeof input.orgName === "string") {
          resolvedOrgName = input.orgName;
        }
      }

      await paymentEmailService.notifyPaymentSuccess({
        to: recipientEmail,
        userName: recipientName,
        orgName: resolvedOrgName,
        amount: Number(payment.amount),
        newBalance,
        orderId: payment.orderId || payment.id,
        paymentId: String(txId),
        bankReference: details?.bankReference,
        paymentMode: details?.paymentMode || payment.paymentMode || "UPI",
        serviceName: payment.serviceRequest?.service?.name || "Cyber Café Wallet Top-up",
      });
    } catch (mailErr) {
      logger.warn(`[PaymentService] Non-blocking payment success notification warning:`, mailErr);
    }
  }

  async markPaymentFailed(
    identifier: string,
    details?: {
      errorMessage?: string;
      rawResponse?: unknown;
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
      include: {
        serviceRequest: true,
      },
    });

    if (!payment) return;

    const safeError = details?.errorMessage
      ? (sanitizeDpdpData(details.errorMessage) || details.errorMessage)
      : undefined;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        errorMessage: safeError,
        gatewayResponse: sanitizeGatewayPayload(details?.rawResponse) as object | undefined,
      },
    });

    await prisma.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { status: "FAILED" },
    });

    await prisma.serviceRequestEvent.create({
      data: {
        serviceRequestId: payment.serviceRequestId,
        status: "FAILED",
        note: `Payment failed: ${safeError || "Payment declined or cancelled by gateway"}`,
      },
    });

    // Trigger Payment Failed Email Notification
    try {
      let recipientEmail = "operator@nagriksevapoint.in";
      let recipientName = "Operator";
      let resolvedOrgName: string | undefined = undefined;

      if (payment.userId) {
        const u = await prisma.user.findUnique({
          where: { id: payment.userId },
          include: {
            members: {
              include: {
                organization: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });
        if (u?.email) recipientEmail = u.email;
        if (u?.name) recipientName = u.name;

        const primaryMember = u?.members?.[0];
        if (primaryMember?.organization?.name) {
          resolvedOrgName = primaryMember.organization.name;
        }
      }

      const orgId = payment.organizationId || payment.serviceRequest?.organizationId;
      if (orgId) {
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
        });
        if (org?.name) {
          resolvedOrgName = org.name;
        }
      }

      if (!resolvedOrgName && payment.serviceRequest?.inputData) {
        const input = payment.serviceRequest.inputData as any;
        if (input?.orgName && typeof input.orgName === "string") {
          resolvedOrgName = input.orgName;
        }
      }

      await paymentEmailService.notifyPaymentFailed({
        to: recipientEmail,
        userName: recipientName,
        orgName: resolvedOrgName,
        amount: Number(payment.amount),
        orderId: payment.orderId || payment.id,
        errorMessage: safeError,
      });
    } catch (mailErr) {
      logger.warn(`[PaymentService] Non-blocking payment failure notification warning:`, mailErr);
    }
  }

  /**
   * Get organization wallet balance
   */
  async getWalletBalance(organizationId: string) {
    let wallet = await prisma.wallet.findUnique({
      where: { organizationId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          organizationId,
          balance: 0.00,
          currency: "INR",
        },
      });
    }

    const recentTransactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      walletId: wallet.id,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        type: tx.type,
        balanceAfter: Number(tx.balanceAfter),
        description: tx.description,
        createdAt: tx.createdAt,
      })),
    };
  }

  /**
   * Get Paginated Wallet Transactions with Filtering and Aggregations
   */
  async getWalletTransactions(
    organizationId: string,
    options?: { page?: number; limit?: number; type?: string; search?: string }
  ) {
    let wallet = await prisma.wallet.findUnique({
      where: { organizationId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          organizationId,
          balance: 0.00,
          currency: "INR",
        },
      });
    }

    const page = Math.max(1, Number(options?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(options?.limit || 20)));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      walletId: wallet.id,
    };

    if (options?.type && options.type !== "ALL") {
      const typeUpper = options.type.toUpperCase();
      if (typeUpper === "REFUND") {
        whereClause.type = "CREDIT";
        whereClause.description = { contains: "refund", mode: "insensitive" };
      } else if (typeUpper === "CREDIT") {
        whereClause.type = "CREDIT";
        whereClause.NOT = { description: { contains: "refund", mode: "insensitive" } };
      } else if (typeUpper === "DEBIT") {
        whereClause.type = "DEBIT";
      }
    }

    if (options?.search?.trim()) {
      const q = options.search.trim();
      whereClause.OR = [
        { description: { contains: q, mode: "insensitive" } },
        { referenceId: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, items, debitSum, refundSum, totalCreditSum] = await Promise.all([
      prisma.walletTransaction.count({ where: whereClause }),
      prisma.walletTransaction.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: "DEBIT" },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          walletId: wallet.id,
          type: "CREDIT",
          description: { contains: "refund", mode: "insensitive" },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: "CREDIT" },
        _sum: { amount: true },
      }),
    ]);

    const totalDebited = Number(debitSum._sum.amount || 0);
    const totalRefunded = Number(refundSum._sum.amount || 0);
    const totalCredited = Math.max(0, Number(totalCreditSum._sum.amount || 0) - totalRefunded);

    return {
      balance: Number(wallet.balance),
      currency: wallet.currency,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        totalCredited,
        totalDebited,
        totalRefunded,
      },
      items: items.map((tx) => {
        const isRef = tx.type === "CREDIT" && !!tx.description?.toLowerCase().includes("refund");
        return {
          id: tx.id,
          amount: Number(tx.amount),
          type: isRef ? ("REFUND" as const) : tx.type,
          balanceAfter: Number(tx.balanceAfter),
          referenceId: tx.referenceId,
          description: tx.description,
          createdAt: tx.createdAt,
        };
      }),
    };
  }

  /**
   * Direct Wallet Payment with 100% Instant Refund Guarantee on failure
   */
  async payWithWallet(
    context: RequestContext,
    input: {
      serviceCode: string;
      stage?: "DETECT" | "UNLOCK";
      amount?: number;
      customerId?: string;
      inputData?: any;
    }
  ) {
    if (!context.organizationId || !context.userId) {
      throw AppError.forbidden("Retailer login required to pay via wallet");
    }

    // 1. Resolve service and pricing
    const service = await serviceService.getServiceByCode(input.serviceCode, context);
    if (!service.isActive) {
      throw AppError.badRequest("Requested service is currently disabled", "SERVICE_DISABLED");
    }

    const priceSnapshot = await pricingService.calculatePrice(service.id, context.pricingTier);
    let servicePrice = Number(priceSnapshot.amount);
    const stage = input.stage || input.inputData?.stage;
    let serviceName = service.name;

    if (input.serviceCode === "PAN_FIND") {
      if (stage === "DETECT" || input.amount === 5) {
        servicePrice = 5.00;
        serviceName = "PAN Detection & Verification";
      } else if (stage === "UNLOCK" || input.amount === 15) {
        servicePrice = 15.00;
        serviceName = "Unlock Full PAN Number";
      }
    }

    // 2. Fetch or initialize wallet
    let wallet = await prisma.wallet.findUnique({
      where: { organizationId: context.organizationId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          organizationId: context.organizationId,
          balance: 0.00,
          currency: "INR",
        },
      });
    }

    const currentBalance = Number(wallet.balance);
    if (currentBalance < servicePrice) {
      throw AppError.badRequest(
        `अपर्याप्त वॉलेट बैलेंस (Insufficient Balance)। वर्तमान बैलेंस ₹${currentBalance.toFixed(2)} है, जबकि इस सेवा का शुल्क ₹${servicePrice.toFixed(2)} है। कृपया वॉलेट रिचार्ज करें।`,
        "INSUFFICIENT_WALLET_BALANCE"
      );
    }

    // 3. Generate Reference
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = `REQ-${dateStr}-${service.code}-${randomSuffix}`;

    const rawInput = (input.inputData || {}) as Record<string, unknown>;
    const mergedInputData = {
      ...rawInput,
      ...(stage ? { stage } : {}),
    };

    // 4. Atomic Deduction & Request Creation
    const { request, balanceAfterDebit } = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: servicePrice } },
      });
      const newBal = Number(updatedWallet.balance);

      const walTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: servicePrice,
          type: "DEBIT",
          balanceAfter: newBal,
          referenceId: referenceNumber,
          description: `Wallet Payment: ${serviceName} (${referenceNumber})`,
        },
      });

      const newReq = await tx.serviceRequest.create({
        data: {
          referenceNumber,
          serviceId: service.id,
          accessMode: "RETAILER",
          pricingTier: context.pricingTier || "PARTNER",
          userId: context.userId,
          organizationId: context.organizationId,
          customerId: input.customerId || null,
          amount: servicePrice,
          currency: "INR",
          status: "PAYMENT_CAPTURED",
          inputData: mergedInputData as any,
        },
      });

      await tx.payment.create({
        data: {
          serviceRequestId: newReq.id,
          organizationId: context.organizationId,
          userId: context.userId,
          amount: servicePrice,
          currency: "INR",
          method: "WALLET",
          status: "CAPTURED",
          paidAt: new Date(),
          paymentMode: "WALLET_DEDUCTION",
          orderId: referenceNumber,
          transactionId: walTx.id,
          bankReference: `WAL-${Date.now()}`,
        },
      });

      await tx.serviceRequestEvent.create({
        data: {
          serviceRequestId: newReq.id,
          status: "PAYMENT_CAPTURED",
          note: `Paid ₹${servicePrice.toFixed(2)} directly from Organization Wallet. New Balance: ₹${newBal.toFixed(2)}`,
        },
      });

      return { request: newReq, balanceAfterDebit: newBal };
    });

    // Stash search token in ephemeral vault if passed
    if (rawInput.searchToken || rawInput.pan || rawInput.vehicleNumber || rawInput.rcNumber) {
      await ephemeralVault.stashTempSearchToken(
        request.id,
        String(rawInput.searchToken || rawInput.pan || rawInput.vehicleNumber || rawInput.rcNumber)
      );
    }

    // 5. Trigger service fulfillment
    try {
      await serviceDispatcher.fulfillAsync(request.id);

      const finalReq = await prisma.serviceRequest.findUnique({
        where: { id: request.id },
      });

      if (finalReq?.status === "PROVIDER_FAILED") {
        const provError = (finalReq?.resultData as any)?.error;
        throw new Error(provError || "Upstream government registry returned no matching record");
      }

      const vault = await ephemeralVault.getVaultItem(request.id);

      return {
        success: true,
        serviceRequestId: request.id,
        referenceNumber,
        amount: servicePrice,
        newBalance: balanceAfterDebit,
        data: vault.data,
        message: stage === "DETECT"
          ? "PAN record identified successfully!"
          : "Payment successful and verified record unlocked!",
      };
    } catch (fulfillmentErr: any) {
      // 6. 100% AUTOMATIC INSTANT REFUND TO WALLET ON FAILURE
      logger.warn(`[PaymentService] Service execution failed for ${request.id}. Issuing instant 100% wallet refund...`);

      const balanceAfterRefund = await prisma.$transaction(async (tx) => {
        const refWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: servicePrice } },
        });
        const refBal = Number(refWallet.balance);

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: servicePrice,
            type: "CREDIT",
            balanceAfter: refBal,
            referenceId: request.id,
            description: `Instant Refund: ${service.name} failed (${referenceNumber})`,
          },
        });

        await tx.payment.updateMany({
          where: { serviceRequestId: request.id },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
            errorMessage: `Auto-refunded to wallet: ${fulfillmentErr?.message || "Service failure"}`,
          },
        });

        await tx.serviceRequest.update({
          where: { id: request.id },
          data: { status: "REFUNDED" },
        });

        await tx.serviceRequestEvent.create({
          data: {
            serviceRequestId: request.id,
            status: "REFUNDED",
            note: `₹${servicePrice.toFixed(2)} instantly refunded back to retailer wallet due to verification failure`,
          },
        });

        return refBal;
      });

      return {
        success: false,
        refunded: true,
        serviceRequestId: request.id,
        referenceNumber,
        amount: servicePrice,
        newBalance: balanceAfterRefund,
        message: `${fulfillmentErr?.message || "सत्यापन असफल रहा"}। ₹${servicePrice.toFixed(2)} आपके वॉलेट में तुरंत (Instant Refund) वापस जमा कर दिए गए हैं। आपका वर्तमान वॉलेट बैलेंस: ₹${balanceAfterRefund.toFixed(2)}।`,
      };
    }
  }

  /**
   * Create a Cashfree Payment Order for Retailer Organization Wallet Top-up
   */
  async createWalletTopupOrder(
    context: { userId: string; organizationId: string },
    amount: number
  ) {
    if (!context.organizationId || !context.userId) {
      throw AppError.forbidden("Retailer login required to top-up wallet", "AUTH_REQUIRED");
    }

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount < 10) {
      throw AppError.badRequest("न्यूनतम टॉप-अप राशि ₹10 है (Minimum top-up amount is ₹10)");
    }
    if (numAmount > 50000) {
      throw AppError.badRequest("अधिकतम टॉप-अप राशि ₹50,000 है (Maximum top-up amount is ₹50,000)");
    }

    // 1. Ensure WALLET_TOPUP service exists
    let service = await prisma.service.findUnique({
      where: { code: "WALLET_TOPUP" },
    });

    if (!service) {
      service = await prisma.service.create({
        data: {
          code: "WALLET_TOPUP",
          name: "Wallet Balance Top-up",
          description: "Instant UPI / QR recharge for retailer organization wallet",
          isPublicAllowed: false,
          isRetailerAllowed: false,
          requiresCustomer: false,
          requiresUpload: false,
          producesDocument: false,
        },
      });
    }

    // 2. Fetch User & Org Details
    const [user, org] = await Promise.all([
      prisma.user.findUnique({ where: { id: context.userId } }),
      prisma.organization.findUnique({ where: { id: context.organizationId } }),
    ]);

    const customerName = user?.name || org?.name || "Cyber Café Retailer";
    const customerEmail = user?.email || "retailer@nagriksevapoint.in";
    const customerPhone = user?.phone ? user.phone.replace(/[^0-9]/g, "").slice(-10) : "9876543210";

    // 3. Generate Unique Reference Number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = `REQ-${dateStr}-TOPUP-${randomSuffix}`;

    // 4. Create ServiceRequest in REQUEST_CREATED status
    const request = await prisma.serviceRequest.create({
      data: {
        referenceNumber,
        serviceId: service.id,
        accessMode: "RETAILER",
        pricingTier: "PARTNER",
        userId: context.userId,
        organizationId: context.organizationId,
        amount: numAmount,
        currency: "INR",
        status: "REQUEST_CREATED",
        inputData: {
          topupAmount: numAmount,
          orgName: org?.name || "Cyber Café",
        },
      },
    });

    await prisma.serviceRequestEvent.create({
      data: {
        serviceRequestId: request.id,
        status: "REQUEST_CREATED",
        note: `Initiated Wallet Top-up order for ₹${numAmount.toFixed(2)} via Cashfree UPI Gateway`,
      },
    });

    // 5. Create Cashfree Order
    const orderNote = `Wallet Top-up ₹${numAmount.toFixed(2)} (${org?.name || "Café"})`;
    const paymentSession = await this.createCashfreeOrderFromRequest(
      {
        id: request.id,
        amount: numAmount,
        organizationId: context.organizationId,
      },
      context.userId,
      null,
      customerName,
      customerEmail,
      customerPhone,
      orderNote,
      {
        type: "WALLET_TOPUP",
        organizationId: context.organizationId,
      }
    );

    return {
      serviceRequestId: request.id,
      referenceNumber,
      amount: numAmount,
      currency: "INR",
      payment: paymentSession,
      order_id: paymentSession.order_id,
      payment_session_id: paymentSession.payment_session_id,
      mode: paymentSession.mode,
    };
  }
}

export const paymentService = new PaymentService();
