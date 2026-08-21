import { z } from "zod";

export const createRequestSchema = z.object({
  serviceCode: z.string().min(1, "Service code is required"),
  customerId: z.string().uuid("Invalid customer ID"),
  inputData: z.record(z.unknown()),
  idempotencyKey: z.string().optional().nullable(),
});

export const queryRequestSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(["CREATED", "PROCESSING", "SUCCESS", "FAILED"]).optional(),
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((
    val,
  ) => (val ? parseInt(val, 10) : 10)),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type QueryRequestInput = z.infer<typeof queryRequestSchema>;
