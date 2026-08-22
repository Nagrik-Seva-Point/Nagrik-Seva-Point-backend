import { z } from "zod";

export const queryServiceSchema = z.object({
  categoryId: z.string().optional(),
  categoryCode: z.string().optional(),
});

export const createServiceSchema = z.object({
  code: z
    .string()
    .min(2, "Service code must be at least 2 characters")
    .max(50)
    .regex(
      /^[A-Z0-9_]+$/,
      "Service code must be uppercase alphanumeric and underscores only (e.g. PAN_FIND)",
    ),
  name: z.string().min(2, "Service name must be at least 2 characters").max(150),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(), // Can pass categoryId or categoryCode
  isPublicAllowed: z.boolean().default(true),
  isRetailerAllowed: z.boolean().default(true),
  requiresCustomer: z.boolean().default(false),
  requiresUpload: z.boolean().default(false),
  producesDocument: z.boolean().default(false),
  isActive: z.boolean().default(true),
  publicPrice: z.number().min(0, "Price cannot be negative").default(40.0),
  partnerPrice: z.number().min(0, "Price cannot be negative").default(25.0),
  partnerGoldPrice: z.number().min(0).optional(),
  enterprisePrice: z.number().min(0).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(),
  isPublicAllowed: z.boolean().optional(),
  isRetailerAllowed: z.boolean().optional(),
  requiresCustomer: z.boolean().optional(),
  requiresUpload: z.boolean().optional(),
  producesDocument: z.boolean().optional(),
  isActive: z.boolean().optional(),
  publicPrice: z.number().min(0).optional(),
  partnerPrice: z.number().min(0).optional(),
  partnerGoldPrice: z.number().min(0).optional(),
  enterprisePrice: z.number().min(0).optional(),
});

export type QueryServiceInput = z.infer<typeof queryServiceSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
