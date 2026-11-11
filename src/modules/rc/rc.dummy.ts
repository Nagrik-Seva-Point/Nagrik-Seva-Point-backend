import type { RcDetailsData, MobileToRcData, RcOwnerHistoryData } from "./rc.schema";

/**
 * Returns exact PlainAPI dummy response format for test vehicle number "DL01AB1234"
 */
export function getDummyRcDetails(vehicleNumber: string = "DL01AB1234"): RcDetailsData {
  return {
    rc_number: vehicleNumber || "DL01AB1234",
    registration_date: "2017-09-05",
    owner_name: "Munna Bhaiya",
    father_name: "Kaleen Bhaiya",
    present_address: "HNO 1-10/2 Mirzapur, Uttar Pradesh",
    permanent_address: "HNO 1-10/2 Mirzapur, Uttar Pradesh",
    mobile_number: "9876543210",
    vehicle_category: "HPV",
    vehicle_chasi_number: "ABCD12LRT0HH123456",
    vehicle_engine_number: "ABCD12H123456",
    maker_description: "VEHICLES LTD",
    maker_model: "EICHER PRO BSIV",
    body_type: "SALOON",
    fuel_type: "DIESEL",
    color: "WHITE",
    norms_type: "BHARAT STAGE IV",
    fit_up_to: "2032-09-05",
    financer: "FINANCE LTD",
    financed: true,
    insurance_company: "Assurance Company Limited",
    insurance_policy_number: "0000023123456789",
    insurance_upto: "2027-09-04",
    manufacturing_date: "8/2017",
    manufacturing_date_formatted: "2017-08",
    registered_at: "MIRZAPUR RTO, Uttar Pradesh",
    latest_by: "2027-09-04",
    less_info: false,
    tax_upto: "2028-09-05",
    tax_paid_upto: "2025-11-30",
    cubic_capacity: "3298",
    vehicle_gross_weight: "9850",
    no_cylinders: "4",
    seat_capacity: "50",
    sleeper_capacity: null,
    standing_capacity: null,
    wheelbase: "5260",
    unladen_weight: "6110",
    vehicle_category_description: "Heavy Passenger Vehicles (Bus)",
    pucc_number: "UP123456789",
    pucc_upto: "2026-12-31",
    permit_number: "123/AB/45/64",
    permit_issue_date: "2017-09-05",
    permit_valid_from: "2017-09-05",
    permit_valid_upto: "2028-11-06",
    permit_type: "TEMPORARY PERMIT",
    national_permit_number: "NP/2017/9981",
    national_permit_upto: "2028-11-06",
    national_permit_issued_by: "UTTAR PRADESH",
    non_use_status: "No",
    non_use_from: null,
    non_use_to: null,
    blacklist_status: "Clean (No Blacklist)",
    noc_details: null,
    owner_number: "1",
    rc_status: "ACTIVE",
    masked_name: false,
    challan_details: null,
    variant: "EICHER PRO BS-IV DIESEL",
  };
}

/**
 * Returns exact PlainAPI MobileToRC dummy response format for test mobile "1234567890"
 */
export function getDummyMobileToRc(mobile: string = "1234567890"): MobileToRcData {
  return {
    mobile_number: mobile || "1234567890",
    rc_number: ["RJ14XJ1234", "RJ14CA5678"],
    total_vehicles: 2,
  };
}

/**
 * Returns exact PlanAPI RcOwnerHistory dummy response format for test vehicle number "DL01AB1234"
 */
export function getDummyRcOwnerHistory(vehicleNumber: string = "DL01AB1234"): RcOwnerHistoryData {
  return {
    rc_number: vehicleNumber || "DL01AB1234",
    current_owner_number: "3",
    current_owner_name: "MAHAMMADALI",
    owner_history: [
      {
        owner_name: "HEMPREET SINGH BAJAJ",
        owner_number: "1",
      },
      {
        owner_name: "VARUNKUMAR DINESHKUMAR GADHAVI",
        owner_number: "2",
      },
      {
        owner_name: "MAHAMMADALI",
        owner_number: "3",
      },
    ],
  };
}
