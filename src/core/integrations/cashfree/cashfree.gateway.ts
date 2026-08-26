import crypto from "crypto";
import { logger } from "../../logger/logger";
import { AppError } from "../../errors/AppError";
import { getCashfreeConfig } from "../../config/env";

const API_VERSION = "2023-08-01";

export interface CreateOrderParams {
  orderId: string;
  orderAmount: number;
  customerId: string;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  orderNote?: string;
  orderTags?: Record<string, string>;
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
    const { clientId, clientSecret, apiUrl } = getCashfreeConfig();

    if (!clientId || !clientSecret) {
      throw AppError.internal("Cashfree credentials not configured");
    }

    const payload: any = {
      order_id: params.orderId,
      order_amount: params.orderAmount,
      order_currency: "INR",
      order_note: params.orderNote || "Nagrik Seva Service Verification",
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

    if (params.orderTags) {
      payload.order_tags = params.orderTags;
    }

    logger.info(`[CashfreeGateway] Creating order: ${params.orderId} for ${params.orderAmount} INR (URL: ${apiUrl})`);

    try {
      const response = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-version": API_VERSION,
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json();

      if (!response.ok) {
        logger.error(`[CashfreeGateway] Order creation failed (${response.status}): ${JSON.stringify(data)} (Client ID: ${clientId.slice(0, 8)}..., URL: ${apiUrl})`);
        const errorMsg = data?.message || "Failed to create Cashfree order";
        throw AppError.badRequest(errorMsg);
      }

      return data as CashfreeOrderResponse;
    } catch (err: any) {
      logger.error(`[CashfreeGateway] Error: ${err.message}`);
      if (err instanceof AppError) throw err;
      throw AppError.internal(err.message || "Cashfree Gateway Error");
    }
  }

  async getOrder(orderId: string): Promise<CashfreeOrderResponse> {
    const { clientId, clientSecret, apiUrl } = getCashfreeConfig();

    if (!clientId || !clientSecret) {
      throw AppError.internal("Cashfree credentials not configured");
    }

    try {
      const response = await fetch(`${apiUrl}/orders/${orderId}`, {
        method: "GET",
        headers: {
          "x-api-version": API_VERSION,
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
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
    const { clientSecret } = getCashfreeConfig();
    if (!signature || !timestamp || !clientSecret) {
      return false;
    }
    
    try {
      const generatedSignature = crypto
        .createHmac("sha256", clientSecret)
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
