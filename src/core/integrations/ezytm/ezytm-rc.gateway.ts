import { ezytmGateway } from "./ezytm.gateway";

export class EzytmRcGateway {
  /**
   * RC Details API
   * POST /api/Ekyc/RcDetails
   */
  async getRcDetails(vehicleNumber: string): Promise<any> {
    const cleanNumber = vehicleNumber.trim().toUpperCase().replace(/[\s\-_]/g, "");
    return await ezytmGateway.postForm<any>(
      "/api/Ekyc/RcDetails",
      {
        VehicleNumber: cleanNumber,
      }
    );
  }

  /**
   * Mobile To RC API
   * POST /Api/Ekyc/MobileToRC
   */
  async getMobileToRc(mobileNumber: string): Promise<any> {
    const cleanMobile = mobileNumber.trim().replace(/\D/g, "");
    return await ezytmGateway.postForm<any>(
      "/Api/Ekyc/MobileToRC",
      {
        MobileNo: cleanMobile,
      }
    );
  }

  /**
   * RC Owner History API
   * POST /Api/Ekyc/RcOwnerHistory
   */
  async getRcOwnerHistory(vehicleNumber: string): Promise<any> {
    const cleanNumber = vehicleNumber.trim().toUpperCase().replace(/[\s\-_]/g, "");
    return await ezytmGateway.postForm<any>(
      "/Api/Ekyc/RcOwnerHistory",
      {
        vehicleNumber: cleanNumber,
      }
    );
  }
}

export const ezytmRcGateway = new EzytmRcGateway();
