import { ezytmGateway } from "./ezytm.gateway.ts";
import type {
  AadharToPanFindResponse,
  PanDetailsResponse,
} from "./ezytm.types.ts";

export class EzytmPanGateway {
  /**
   * 1. Aadhar to Pan Find API
   * POST /Api/Ekyc/AadharToPanFind
   */
  async findPanByAadhaar(aadhaar: string): Promise<AadharToPanFindResponse> {
    return await ezytmGateway.postForm<AadharToPanFindResponse>(
      "/Api/Ekyc/AadharToPanFind",
      { Aadhaarid: aadhaar.trim() },
    );
  }

  /**
   * 2. PAN Card Details API
   * POST /api/Ekyc/PanDetails
   */
  async getPanDetails(pan: string): Promise<PanDetailsResponse> {
    return await ezytmGateway.postForm<PanDetailsResponse>(
      "/api/Ekyc/PanDetails",
      { Panid: pan.trim().toUpperCase() },
    );
  }
}

export const ezytmPanGateway = new EzytmPanGateway();
