import { z } from "zod";

export const createOrderSchema = z.object({
  serviceCode: z.string(),
  customerId: z.string().optional(),
  inputData: z.record(z.any()), // e.g. { pan: "ABCDE1234F" }
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
