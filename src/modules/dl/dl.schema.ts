import { z } from "zod";

// ==========================================
// 1. INPUT VALIDATION SCHEMAS
// ==========================================

export const dlDetailsSchema = z.object({
  dlNumber: z
    .string()
    .trim()
    .min(5, "Driving License number must be at least 5 characters")
    .max(30, "Driving License number too long")
    .transform((val) => val.replace(/[\s\-_]/g, "").toUpperCase()),
  dob: z
    .string()
    .trim()
    .min(8, "Date of birth is required")
    .max(12, "Invalid Date of birth format"),
  customerId: z.string().uuid().optional(),
});

export type DlDetailsInput = z.infer<typeof dlDetailsSchema>;

export const verifyDlSchema = z.object({
  dlNumber: z
    .string()
    .trim()
    .min(5, "Driving License number must be at least 5 characters")
    .max(30, "Driving License number too long")
    .transform((val) => val.replace(/[\s\-_]/g, "").toUpperCase()),
  dob: z
    .string()
    .trim()
    .min(8, "Date of birth is required")
    .max(12, "Invalid Date of birth format"),
});

export type VerifyDlInput = z.infer<typeof verifyDlSchema>;

// ==========================================
// 2. OUTPUT DTO TYPES (PlanAPI DL Standard)
// ==========================================

export interface DlDetailsData {
  license_number: string;
  holder_name: string;
  father_or_husband_name: string;
  dob: string;
  gender: string;
  blood_group: string;
  issue_date: string;
  valid_from: string;
  valid_upto: string;
  vehicle_class: string;
  rto_code: string;
  rto: string;
  state: string;
  permanent_address: string;
  permanent_zip: string;
  temporary_address: string;
  temporary_zip: string;
  status: string;
  image?: string | null;
  transaction_details?: {
    transaction_name?: string;
    transaction_date?: string;
    application_number?: string;
    status?: string;
  };
}

export interface VerifyDlOutput {
  dlNumber: string;
  holderNameMasked: string;
  dob: string;
  rto: string;
  vehicleClass: string;
  status: string;
}
