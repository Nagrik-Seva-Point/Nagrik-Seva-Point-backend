import { z } from "zod";

export const createPaymentOrderSchema = z.object({
  serviceRequestId: z.string().uuid("Invalid Service Request ID format"),
});

export const confirmPaymentSchema = z.object({
  paymentId: z.string().uuid("Invalid Payment ID format"),
  gatewayPaymentId: z.string().min(1, "Gateway payment ID is required"),
  gatewaySignature: z.string().optional(),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
