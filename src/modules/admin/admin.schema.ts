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

export const targetedEmailSchema = z.object({
  recipientEmails: z.array(z.string().email()).min(1, "At least one recipient email is required"),
  subject: z.string().min(1, "Subject is required"),
  title: z.string().optional(),
  message: z.string().min(1, "Message content is required"),
  severity: z.enum(["info", "warning", "urgent", "success"]).default("info"),
  testEmail: z.string().email().optional().or(z.literal("")),
  language: z.enum(["hi", "en"]).default("hi").optional(),
  includeButton: z.boolean().default(true).optional(),
});
export type TargetedEmailInput = z.infer<typeof targetedEmailSchema>;


