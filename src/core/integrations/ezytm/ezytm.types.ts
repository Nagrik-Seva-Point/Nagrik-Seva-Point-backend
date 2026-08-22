/**
 * Pure vendor-level response types for EzyTM / PlanAPI Gateways
 */

// 1. Aadhar to Pan Find Vendor Response
export interface AadharToPanFindResponse {
  Errorcode: number;
  Status: string;
  Message?: string;
  Data: {
    PanNumber: string | null;
    AadharNumber: string | null;
    Message: string | null;
  } | null;
}

// 2. PAN Details Vendor Response
export interface PanDetailsResponse {
  Errorcode: number;
  status: string;
  msg: string;
  data: {
    client_id?: string | null;
    pan_number: string | null;
    full_name: string | null;
    full_name_split?: [string, string, string] | null;
    masked_aadhaar: string | null;
    address?: Record<string, unknown> | null;
    email?: string | null;
    phone_number?: string | null;
    gender: string | null;
    dob: string | null;
    input_dob?: string | null;
    aadhaar_linked: boolean;
    dob_verified?: boolean;
    dob_check?: boolean;
    category: string | null;
    less_info?: boolean;
  } | null;
}
