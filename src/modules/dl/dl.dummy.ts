import type { DlDetailsData } from "./dl.schema";

/**
 * Returns exact PlanAPI Driving License dummy response format for test DL "DL1420110012345"
 */
export function getDummyDlDetails(dlNumber: string = "DL1420110012345", dob: string = "15-08-1992"): DlDetailsData {
  const clean = dlNumber || "DL1420110012345";
  return {
    license_number: clean,
    holder_name: "MUNNA BHAIYA",
    father_or_husband_name: "KALEEN BHAIYA",
    dob: dob || "15-08-1992",
    gender: "MALE",
    blood_group: "B+",
    issue_date: "12-04-2011",
    valid_from: "12-04-2011",
    valid_upto: "14-08-2032",
    vehicle_class: "LMV, MCWG",
    rto_code: "DL14",
    rto: "DELHI CENTRAL RTO",
    state: "DELHI",
    permanent_address: "HNO 1-10/2 Civil Lines, Mirzapur, Uttar Pradesh",
    permanent_zip: "231001",
    temporary_address: "HNO 1-10/2 Civil Lines, Mirzapur, Uttar Pradesh",
    temporary_zip: "231001",
    status: "ACTIVE",
    image: null,
    transaction_details: {
      transaction_name: "ISSUE OF DRIVING LICENCE & COV ENDORSEMENT",
      transaction_date: "12-04-2011",
      application_number: "APPL-DL14-0012345",
      status: "COMPLETED & APPROVED",
    },
  };
}
