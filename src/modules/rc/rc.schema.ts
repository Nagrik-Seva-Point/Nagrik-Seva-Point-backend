import { z } from "zod";

// ==========================================
// 1. INPUT VALIDATION SCHEMAS
// ==========================================

export const rcDetailsSchema = z.object({
  vehicleNumber: z
    .string()
    .trim()
    .min(5, "Vehicle registration number must be at least 5 characters")
    .max(20, "Vehicle registration number too long")
    .transform((val) => val.replace(/[\s\-_]/g, "").toUpperCase()),
  customerId: z.string().uuid().optional(),
});

export type RcDetailsInput = z.infer<typeof rcDetailsSchema>;

export const verifyRcSchema = z.object({
  vehicleNumber: z
    .string()
    .trim()
    .min(5, "Vehicle registration number must be at least 5 characters")
    .max(20, "Vehicle registration number too long")
    .transform((val) => val.replace(/[\s\-_]/g, "").toUpperCase()),
});

export type VerifyRcInput = z.infer<typeof verifyRcSchema>;

// ==========================================
// 2. OUTPUT DTO TYPES (PlainAPI RC Full Details Standard)
// ==========================================

export interface RcDetailsData {
  rc_number: string;
  registration_date: string;
  owner_name: string;
  father_name: string;
  present_address: string;
  permanent_address: string;
  mobile_number: string;
  vehicle_category: string;
  vehicle_chasi_number: string;
  vehicle_engine_number: string;
  maker_description: string;
  maker_model: string;
  body_type: string;
  fuel_type: string;
  color: string;
  norms_type: string;
  fit_up_to: string;
  financer: string;
  financed: boolean;
  insurance_company: string;
  insurance_policy_number: string;
  insurance_upto: string;
  manufacturing_date: string;
  manufacturing_date_formatted: string;
  registered_at: string;
  latest_by?: string;
  less_info?: boolean;
  tax_upto: string | null;
  tax_paid_upto: string | null;
  cubic_capacity: string;
  vehicle_gross_weight: string;
  no_cylinders: string;
  seat_capacity: string;
  sleeper_capacity?: string | null;
  standing_capacity?: string | null;
  wheelbase: string;
  unladen_weight: string;
  vehicle_category_description: string;
  pucc_number: string;
  pucc_upto: string | null;
  permit_number?: string | null;
  permit_issue_date?: string | null;
  permit_valid_from?: string | null;
  permit_valid_upto?: string | null;
  permit_type?: string | null;
  national_permit_number?: string | null;
  national_permit_upto?: string | null;
  national_permit_issued_by?: string | null;
  non_use_status?: string | null;
  non_use_from?: string | null;
  non_use_to?: string | null;
  blacklist_status?: string | null;
  noc_details?: string | null;
  owner_number: string;
  rc_status: string | null;
  masked_name: boolean;
  challan_details?: unknown;
  variant?: string | null;
}

export interface VerifyRcOutput {
  vehicleNumber: string;
  ownerNameMasked: string;
  makerModel: string;
  fuelType: string;
  status: string;
}

// ==========================================
// 3. MOBILE TO RC SCHEMAS & TYPES
// ==========================================

export const mobileToRcSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Mobile number must be a valid 10-digit Indian mobile number"),
  customerId: z.string().uuid().optional(),
});

export type MobileToRcInput = z.infer<typeof mobileToRcSchema>;

export interface MobileToRcData {
  mobile_number: string;
  rc_number: string[];
  total_vehicles: number;
}

export interface VerifyMobileToRcOutput {
  mobileNumber: string;
  vehicleCount: number;
  status: string;
}

// ==========================================
// 4. RC OWNER HISTORY SCHEMAS & TYPES
// ==========================================

export const rcOwnerHistorySchema = z.object({
  vehicleNumber: z
    .string()
    .trim()
    .min(5, "Vehicle registration number must be at least 5 characters")
    .max(20, "Vehicle registration number too long")
    .transform((val) => val.replace(/[\s\-_]/g, "").toUpperCase()),
  customerId: z.string().uuid().optional(),
});

export type RcOwnerHistoryInput = z.infer<typeof rcOwnerHistorySchema>;

export interface RcOwnerHistoryItem {
  owner_name: string;
  owner_number: string;
}

export interface RcOwnerHistoryData {
  rc_number: string;
  current_owner_number: string;
  current_owner_name: string;
  owner_history: RcOwnerHistoryItem[];
}
