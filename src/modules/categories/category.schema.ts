import { z } from "zod";

export const createCategorySchema = z.object({
  code: z
    .string()
    .min(2, "Category code must be at least 2 characters")
    .max(50)
    .regex(
      /^[A-Z0-9_]+$/,
      "Category code must be uppercase alphanumeric and underscores only (e.g. AGRICULTURE)",
    ),
  name: z.string().min(2, "Category name must be at least 2 characters").max(100),
  description: z.string().optional(),
  icon: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const queryCategorySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type QueryCategoryInput = z.infer<typeof queryCategorySchema>;
