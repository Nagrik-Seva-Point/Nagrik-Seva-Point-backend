import { ezytmPanGateway } from "../../core/integrations/ezytm/ezytm-pan.gateway";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import type { PanDetailsOutput, PanFindOutput } from "./pan.schema";

export class PanService {
  /**
   * 1. Find PAN Number by 12-digit Aadhaar
   */
  async findPanByAadhaar(aadhaar: string): Promise<PanFindOutput> {
    logger.info(
      `[PanService] Finding PAN for Aadhaar ending in ${aadhaar.slice(-4)}`,
    );

    const response = await ezytmPanGateway.findPanByAadhaar(aadhaar);
    logger.info(`[PanService] Raw response received: ${JSON.stringify(response)}`);

    const panNumber = response.Data?.PanNumber?.trim()?.toUpperCase();

    if (response.Errorcode === 100) {
      if (panNumber) {
        const maskedPan = `XXXXX${panNumber.substring(5, 9)}${panNumber.substring(9)}`;
        logger.info(`[PanService] Successfully found PAN: ${maskedPan}`);

        return {
          pan: panNumber,
          maskedPan,
        };
      }

      // Handled case: PAN is linked according to official API, but PAN number is not exposed/found in this response
      if (response.Data?.Message?.toLowerCase() === "linked") {
        const linkedMsg = "PAN is linked with this Aadhaar number, but PAN number were not found. Please try again later.";
        logger.warn(`[PanService] ${linkedMsg}`);
        throw AppError.badRequest(linkedMsg, "PAN_LINKED_NO_DATA");
      }

      const notFoundMsg = "PAN is linked but data not found. Please try again later.";
      logger.warn(`[PanService] ${notFoundMsg}`);
      throw AppError.badRequest(notFoundMsg, "PAN_NOT_FOUND");
    }

    if (response.Errorcode === 101) {
      logger.warn(`[PanService] PAN not found for Aadhaar ending in ${aadhaar.slice(-4)}`);
      throw AppError.badRequest("No PAN found linked with the provided Aadhaar number.", "PAN_NOT_FOUND");
    }

    const fallbackMsg = (response.Message && response.Message !== "Data Fetch Successfully")
      ? response.Message
      : "Failed to find PAN for this Aadhaar. Please try again later.";

    logger.warn(`[PanService] Find PAN failed: ${fallbackMsg}`);
    throw AppError.badRequest(fallbackMsg, "PAN_FIND_FAILED");
  }

  /**
   * 2. Fetch Comprehensive PAN Details
   */
  async getPanDetails(pan: string): Promise<PanDetailsOutput> {
    const cleanPan = pan.trim().toUpperCase();
    // logger.info(`[PanService] Fetching details for PAN: ${cleanPan}`);

    const response = await ezytmPanGateway.getPanDetails(cleanPan);

    if (response.Errorcode === 100 && response.data) {
      const d = response.data;
      return {
        pan: d.pan_number || cleanPan,
        fullName: d.full_name || "N/A",
        maskedAadhaar: d.masked_aadhaar || "N/A",
        dob: d.dob || "N/A",
        gender: d.gender === "M"
          ? "Male (M)"
          : d.gender === "F"
          ? "Female (F)"
          : (d.gender || "N/A"),
        aadhaarLinked: Boolean(d.aadhaar_linked),
        category: d.category
          ? `${d.category.charAt(0).toUpperCase() + d.category.slice(1)}`
          : "Individual",
      };
    }

    const failureReason = response.msg ||
      "Failed to retrieve PAN details from official registry.";
    logger.warn(`[PanService] Fetch PAN details failed: ${failureReason}`);
    throw AppError.badRequest(failureReason, "PAN_DETAILS_FAILED");
  }
}

export const panService = new PanService();
