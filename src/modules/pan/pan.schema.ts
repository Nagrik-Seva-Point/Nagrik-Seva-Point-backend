import { z } from "zod";

// ==========================================
// 1. INPUT VALIDATION SCHEMAS
// ==========================================

export const findPanSchema = z.object({
  aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits"),
});

export type FindPanInput = z.infer<typeof findPanSchema>;

export const panDetailsSchema = z
  .object({
    searchToken: z.string().optional(),
    pan: z
      .string()
      .regex(
        /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i,
        "Invalid PAN number format",
      )
      .optional(),
  })
  .refine((data) => Boolean(data.searchToken || data.pan), {
    message: "Either searchToken or pan must be provided",
  });

export type PanDetailsInput = z.infer<typeof panDetailsSchema>;

export const decryptPanTokenSchema = z.object({
  searchToken: z.string().min(10, "Search token is required"),
});

export type DecryptPanTokenInput = z.infer<typeof decryptPanTokenSchema>;

export const verifyPanDetailsSchema = z.object({
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN number format"),
});

export type VerifyPanDetailsInput = z.infer<typeof verifyPanDetailsSchema>;

// ==========================================
// 2. CLEAN OUTPUT DTO TYPES
// ==========================================

export interface PanFindOutput {
  maskedPan: string;
  searchToken: string;
}

export interface DecryptPanTokenOutput {
  pan: string;
  maskedAadhaar: string;
}

export interface VerifyPanDetailsOutput {
  pan: string;
  maskedName?: string;
  searchToken: string;
}

export interface PanDetailsOutput {
  pan: string;
  fullName: string;
  maskedAadhaar: string;
  dob: string;
  gender: string;
  aadhaarLinked: boolean;
  category: string;
}
