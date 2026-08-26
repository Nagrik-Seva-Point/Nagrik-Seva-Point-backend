import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { createOrderSchema, type CreateOrderInput } from "./payment.schema";
import { paymentService } from "./payment.service";
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
  } catch (err) {
    // If signature fails, throw 400. Otherwise 500.
    return c.json({ success: false, message: "Webhook processing failed" }, 400);
  }
});
