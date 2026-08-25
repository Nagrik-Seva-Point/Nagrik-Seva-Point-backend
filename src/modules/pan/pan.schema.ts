import { z } from "zod";

// ==========================================
// 1. INPUT VALIDATION SCHEMAS
// ==========================================

export const findPanSchema = z.object({
  aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits"),
});

export type FindPanInput = z.infer<typeof findPanSchema>;

export const panDetailsSchema = z.object({
  pan: z.string().regex(
    /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i,
    "Invalid PAN number format",
  ),
});

export type PanDetailsInput = z.infer<typeof panDetailsSchema>;

// ==========================================
// 2. CLEAN OUTPUT DTO TYPES
// ==========================================

export interface PanFindOutput {
  pan: string;
  maskedPan: string;
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
