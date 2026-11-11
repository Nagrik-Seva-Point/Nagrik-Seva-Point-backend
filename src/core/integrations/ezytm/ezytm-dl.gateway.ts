import { ezytmGateway } from "./ezytm.gateway";

export class EzytmDlGateway {
  /**
   * Driving License Verification API
   * POST /Api/Ekyc/DLVerification
   */
  async verifyDrivingLicense(dlNumber: string, dob: string): Promise<any> {
    const cleanNumber = dlNumber.trim().toUpperCase().replace(/[\s\-_]/g, "");
    
    // Normalize dob to DD-MM-YYYY if passed as YYYY-MM-DD
    let formattedDob = dob.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(formattedDob)) {
      const [year, month, day] = formattedDob.split("-");
      formattedDob = `${day}-${month}-${year}`;
    }

    return await ezytmGateway.postForm<any>(
      "/Api/Ekyc/DLVerification",
      {
        DLNumber: cleanNumber,
        DateofBirth: formattedDob,
      }
    );
  }
}

export const ezytmDlGateway = new EzytmDlGateway();
