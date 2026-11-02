import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { createOrderSchema, type CreateOrderInput } from "./payment.schema";
import { paymentService } from "./payment.service";
import { paymentEmailService } from "../../core/mail/payment-email.service";
import { requestService } from "../requests/request.service";
import { AppError } from "../../core/errors/AppError";
import type { ContextVariables } from "../../app/context";

export const paymentRoutes = new Hono<ContextVariables>();

/**
 * 1. Create a Payment Order
 * This is called by the frontend when user clicks "Pay Now"
 */
paymentRoutes.post(
  "/cashfree/create-order",
  validationMiddleware(createOrderSchema),
  async (c) => {
    const input = c.get("validData") as CreateOrderInput;
    const requestContext = c.get("requestContext");

    // Hand off to the robust Service Request generator (supports both RETAILER and GUEST)
    const result = await requestService.createRequest(
      requestContext,
      {
        serviceCode: input.serviceCode,
        customerId: input.customerId,
        input: input.inputData
      }
    );

    return c.json({ success: true, data: result });
  }
);

/**
 * 2. Confirm / Sync Payment Order (Instant post-modal sync)
 */
paymentRoutes.post("/cashfree/confirm", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const orderId = body.orderId || body.serviceRequestId;
  const cfPaymentId = body.cfPaymentId;

  if (!orderId) {
    throw AppError.badRequest("orderId or serviceRequestId is required");
  }

  const updatedRequest = await paymentService.confirmPaymentOrder(orderId, cfPaymentId);
  return c.json({ success: true, data: updatedRequest });
});

/**
 * 3. Cashfree Webhook Listener
 * Cashfree calls this asynchronously. 
 */
paymentRoutes.post("/cashfree/webhook", async (c) => {
  const signature = c.req.header("x-webhook-signature") || "";
  const timestamp = c.req.header("x-webhook-timestamp") || "";
  const rawBody = await c.req.text();

  // Process asynchronously without waiting, or await depending on requirement.
  // Awaiting is safer to ensure it succeeds, Cashfree expects 200 OK fast.
  try {
    await paymentService.handleCashfreeWebhook(rawBody, signature, timestamp);
    return c.json({ success: true, message: "Webhook processed" }, 200);
  } catch (_err) {
    // If signature fails, throw 400. Otherwise 500.
    return c.json({ success: false, message: "Webhook processing failed" }, 400);
  }
});

/**
 * 4. Get Current Retailer Wallet Balance
 * GET /payments/wallet/balance
 */
paymentRoutes.get("/wallet/balance", async (c) => {
  const orgId = c.get("organizationId");
  if (!orgId) {
    return c.json({ success: true, data: { balance: 0.00, currency: "INR", recentTransactions: [] } });
  }

  const result = await paymentService.getWalletBalance(orgId);
  return c.json({ success: true, data: result });
});

/**
 * 4.1. Get Paginated Wallet Transaction History
 * GET /payments/wallet/transactions
 */
paymentRoutes.get("/wallet/transactions", async (c) => {
  const orgId = c.get("organizationId");
  if (!orgId) {
    return c.json({
      success: true,
      data: {
        balance: 0.00,
        currency: "INR",
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        stats: { totalCredited: 0, totalDebited: 0, totalRefunded: 0 },
        items: [],
      },
    });
  }

  const query = c.req.query();
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 20;
  const type = query.type;
  const search = query.search;

  const result = await paymentService.getWalletTransactions(orgId, {
    page,
    limit,
    type,
    search,
  });

  return c.json({ success: true, data: result });
});

/**
 * 5. Direct Wallet Payment with 100% Instant Refund Guarantee
 * POST /payments/wallet/pay
 */
paymentRoutes.post("/wallet/pay", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const requestContext = c.get("requestContext");
  const orgId = c.get("organizationId");
  const user = c.get("user");
  const userId = user?.id;

  if (!orgId || !userId) {
    throw AppError.forbidden("Retailer login required to pay via wallet");
  }

  const { serviceCode, customerId, inputData, stage, amount } = body;
  if (!serviceCode) {
    throw AppError.badRequest("serviceCode is required");
  }

  const result = await paymentService.payWithWallet(requestContext, {
    serviceCode,
    stage,
    amount,
    customerId,
    inputData,
  });

  return c.json({ success: true, data: result });
});

/**
 * 6. Create Wallet Top-up Order (Cashfree UPI / QR / NetBanking)
 * POST /payments/wallet/topup/create-order
 */
paymentRoutes.post("/wallet/topup/create-order", async (c) => {
  const orgId = c.get("organizationId");
  const user = c.get("user");
  const userId = user?.id;

  if (!orgId || !userId) {
    throw AppError.forbidden("Retailer login required to top-up wallet", "AUTH_REQUIRED");
  }

  const body = await c.req.json().catch(() => ({}));
  const amount = Number(body.amount);

  const result = await paymentService.createWalletTopupOrder(
    { userId, organizationId: orgId },
    amount
  );

  return c.json({ success: true, data: result });
});

/**
 * 7. Confirm Wallet Top-up (called post-Cashfree modal checkout)
 * POST /payments/wallet/topup/confirm
 */
paymentRoutes.post("/wallet/topup/confirm", async (c) => {
  const orgId = c.get("organizationId");
  if (!orgId) {
    throw AppError.forbidden("Retailer login required to confirm top-up", "AUTH_REQUIRED");
  }

  const body = await c.req.json().catch(() => ({}));
  const orderId = body.orderId || body.serviceRequestId;
  const cfPaymentId = body.cfPaymentId;

  if (!orderId) {
    throw AppError.badRequest("orderId is required");
  }

  // Confirm payment via gateway & trigger fulfillment (which increments wallet)
  await paymentService.confirmPaymentOrder(orderId, cfPaymentId);

  // Fetch updated wallet balance
  const wallet = await paymentService.getWalletBalance(orgId);

  return c.json({
    success: true,
    data: {
      newBalance: wallet.balance,
      currency: wallet.currency,
      message: "Wallet balance updated successfully!",
    },
  });
});

/**
 * 8. Live In-Browser Template Previews (Zero Real Email Sent)
 * GET /payments/email-preview/success
 * GET /payments/email-preview/failed
 */
paymentRoutes.get("/email-preview/success", (c) => {
  const preview = paymentEmailService.generateSuccessEmailHtml({
    to: "retailer@cybercafe.in",
    userName: "Vikash Kumar",
    orgName: "Shree Balaji Cyber Café",
    amount: 500.00,
    newBalance: 1250.00,
    orderId: "CF_ORD_9847291834_DEMO",
    paymentId: "CF_PAY_882947192",
    bankReference: "UTR983471928374",
    paymentMode: "UPI QR (Google Pay)",
    serviceName: "Cyber Café Wallet Top-up",
  });
  return c.html(preview.html);
});

paymentRoutes.get("/email-preview/failed", (c) => {
  const preview = paymentEmailService.generateFailedEmailHtml({
    to: "retailer@cybercafe.in",
    userName: "Vikash Kumar",
    orgName: "Shree Balaji Cyber Café",
    amount: 500.00,
    orderId: "CF_ORD_9847291834_DEMO",
    errorMessage: "UPI PIN Timeout or User Cancelled on Mobile App (Bank Code: U30)",
  });
  return c.html(preview.html);
});


