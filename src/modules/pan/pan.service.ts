import { ezytmPanGateway } from "../../core/integrations/ezytm/ezytm-pan.gateway";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import type { PanDetailsOutput, PanFindOutput } from "./pan.schema";

export class PanService {
  /**
   * 1. Find PAN Number by 12-digit Aadhaar
   */
  async findPanByAadhaar(aadhaar: string): Promise<PanFindOutput> {
    logger.info(`[PanService] Finding PAN for Aadhaar ending in ${aadhaar.slice(-4)}`);

    const response = await ezytmPanGateway.findPanByAadhaar(aadhaar);
    
    if (response.Errorcode === 100 && response.Data?.PanNumber) {
      const pan = response.Data.PanNumber.trim().toUpperCase();
      const maskedPan = `XXXXX${pan.substring(5, 9)}${pan.substring(9)}`;

      logger.info(`[PanService] Found PAN: ${response.Data}`);

      return {
        pan,
        maskedPan,
      };
    }

    const failureReason = response.Message || "No PAN found linked with this Aadhaar number in official registries.";
    logger.warn(`[PanService] Find PAN failed: ${failureReason}`);
    throw AppError.badRequest(failureReason, "PAN_NOT_FOUND");
  }

  /**
   * 2. Fetch Comprehensive PAN Details
   */
  async getPanDetails(pan: string): Promise<PanDetailsOutput> {
    const cleanPan = pan.trim().toUpperCase();
    logger.info(`[PanService] Fetching details for PAN: ${cleanPan}`);

    const response = await ezytmPanGateway.getPanDetails(cleanPan);

    if (response.Errorcode === 100 && response.data) {
      const d = response.data;
      return {
        pan: d.pan_number || cleanPan,
        fullName: d.full_name || "N/A",
        maskedAadhaar: d.masked_aadhaar || "N/A",
        dob: d.dob || "N/A",
        gender: d.gender === "M" ? "Male (M)" : d.gender === "F" ? "Female (F)" : (d.gender || "N/A"),
        aadhaarLinked: Boolean(d.aadhaar_linked),
        category: d.category ? `${d.category.charAt(0).toUpperCase() + d.category.slice(1)}` : "Individual",
      };
    }

    const failureReason = response.msg || "Failed to retrieve PAN details from official registry.";
    logger.warn(`[PanService] Fetch PAN details failed: ${failureReason}`);
    throw AppError.badRequest(failureReason, "PAN_DETAILS_FAILED");
  }
}

export const panService = new PanService();
