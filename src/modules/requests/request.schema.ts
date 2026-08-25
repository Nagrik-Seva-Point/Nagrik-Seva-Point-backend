import { z } from "zod";

export const createRequestSchema = z.object({
  serviceCode: z.string().min(1, "Service code is required"),
  customerId: z.string().uuid("Invalid customer ID").optional().nullable(),
  input: z.record(z.unknown()).refine(
    (val) => Object.keys(val).length > 0,
    "Input parameters are required for service execution",
  ),
  idempotencyKey: z.string().min(6).max(128).optional(),
});

export const confirmRequestPaymentSchema = z.object({
  paymentId: z.string().uuid("Invalid payment ID"),
  gatewayPaymentId: z.string().min(1, "Gateway payment ID is required"),
  gatewaySignature: z.string().optional(),
});

export const queryRequestSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum([
    "REQUEST_CREATED",
    "PRICE_LOCKED",
    "PAYMENT_PENDING",
    "PAYMENT_CAPTURED",
    "PROCESSING",
    "COMPLETED",
    "PROVIDER_FAILED",
    "CANCELLED",
    "REFUND_PENDING",
    "REFUNDED",
    // Compatibility
    "CREATED",
    "SUCCESS",
    "FAILED",
  ]).optional(),
  serviceCode: z.string().optional(),
  customerId: z.string().uuid().optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ConfirmRequestPaymentInput = z.infer<
  typeof confirmRequestPaymentSchema
>;
export type QueryRequestInput = z.infer<typeof queryRequestSchema>;
