import crypto from "crypto";
import { logger } from "../../logger/logger";
import { AppError } from "../../errors/AppError";

const CASHFREE_API_URL = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg";
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID || "";
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET || "";
const API_VERSION = "2023-08-01";

export interface CreateOrderParams {
  orderId: string;
  orderAmount: number;
  customerId: string;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  returnUrl?: string;
  notifyUrl?: string;
}

export interface CashfreeOrderResponse {
  order_id: string;
  payment_session_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  cf_order_id?: string | number;
  [key: string]: any;
}

export class CashfreeGateway {
  
  async createOrder(params: CreateOrderParams): Promise<CashfreeOrderResponse> {
    if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
      throw AppError.internal("Cashfree credentials not configured");
    }

    const payload = {
      order_id: params.orderId,
      order_amount: params.orderAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: params.customerId,
        customer_phone: params.customerPhone || "9999999999",
        customer_email: params.customerEmail || "no-reply@nagriksevapoint.in",
        customer_name: params.customerName || "Customer",
      },
      order_meta: {
        return_url: params.returnUrl || `https://nagriksevapoint.in/dashboard/requests/${params.orderId}?payment=true`,
        notify_url: params.notifyUrl || `https://api.nagriksevapoint.in/api/v1/payments/cashfree/webhook`
      },
    };

    logger.info(`[CashfreeGateway] Creating order: ${params.orderId} for ${params.orderAmount} INR`);

    try {
      const response = await fetch(`${CASHFREE_API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-version": API_VERSION,
          "x-client-id": CASHFREE_CLIENT_ID,
          "x-client-secret": CASHFREE_CLIENT_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error(`[CashfreeGateway] Order creation failed: ${JSON.stringify(data)}`);
        throw AppError.internal("Failed to create Cashfree order");
      }

      return data as CashfreeOrderResponse;
    } catch (err: any) {
      logger.error(`[CashfreeGateway] Error: ${err.message}`);
      throw AppError.internal("Cashfree Gateway Error");
    }
  }

  async getOrder(orderId: string): Promise<CashfreeOrderResponse> {
    if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
      throw AppError.internal("Cashfree credentials not configured");
    }

    try {
      const response = await fetch(`${CASHFREE_API_URL}/orders/${orderId}`, {
        method: "GET",
        headers: {
          "x-api-version": API_VERSION,
          "x-client-id": CASHFREE_CLIENT_ID,
          "x-client-secret": CASHFREE_CLIENT_SECRET,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        logger.error(`[CashfreeGateway] Get order failed: ${JSON.stringify(data)}`);
        throw AppError.internal("Failed to retrieve Cashfree order status");
      }

      return data as CashfreeOrderResponse;
    } catch (err: any) {
      logger.error(`[CashfreeGateway] Error getting order: ${err.message}`);
      throw AppError.internal("Cashfree Gateway Error");
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean {
    if (!signature || !timestamp || !CASHFREE_CLIENT_SECRET) {
      return false;
    }
    
    try {
      const generatedSignature = crypto
        .createHmac("sha256", CASHFREE_CLIENT_SECRET)
        .update(timestamp + rawBody)
        .digest("base64");

      return generatedSignature === signature;
    } catch (err) {
      logger.error("[CashfreeGateway] Signature verification exception");
      return false;
    }
  }
}

export const cashfreeGateway = new CashfreeGateway();
