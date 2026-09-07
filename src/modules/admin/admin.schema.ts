import { z } from "zod";

export const walletAdjustmentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  type: z.enum(["CREDIT", "DEBIT"]),
  reason: z.string().min(3, "Mandatory audit reason must be at least 3 characters"),
  referenceId: z.string().optional(),
});


export const disputeManualOverrideSchema = z.object({
  resultData: z.union([z.record(z.any()), z.string()]),
  note: z.string().optional(),
});

export const maintenanceToggleSchema = z.object({
  scope: z.enum(["GLOBAL", "SERVICE"]).default("SERVICE"),
  serviceCode: z.string().optional(),
  enabled: z.boolean(),
  message: z.string().optional(),
});

export const announcementSchema = z
  .object({
    active: z.boolean(),
    message: z.string().optional().default(""),
    title: z.string().optional(),
    severity: z.enum(["info", "warning", "success"]).default("info"),
    expiresAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.active && (!data.message || !data.message.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Message is required when announcement is active",
        path: ["message"],
      });
    }
  });

export const orgStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  reason: z.string().optional(),
});

export const tierPriceUpdateSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  pricingTier: z.enum(["PUBLIC", "PARTNER", "PARTNER_GOLD", "ENTERPRISE"]),
  amount: z.number().min(0, "Amount cannot be negative"),
});

export const auditLogQuerySchema = z.object({
  organizationId: z.string().optional(),
  category: z.enum(["ALL", "WALLET", "SERVICE", "MILESTONE", "SECURITY"]).default("ALL"),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(30),
});

export type WalletAdjustmentInput = z.infer<typeof walletAdjustmentSchema>;
export type DisputeManualOverrideInput = z.infer<typeof disputeManualOverrideSchema>;
export type MaintenanceToggleInput = z.infer<typeof maintenanceToggleSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type OrgStatusInput = z.infer<typeof orgStatusSchema>;
export type TierPriceUpdateInput = z.infer<typeof tierPriceUpdateSchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

