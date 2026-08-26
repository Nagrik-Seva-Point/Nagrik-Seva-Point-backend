import { ezytmPanGateway } from "../../core/integrations/ezytm/ezytm-pan.gateway";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { encryptPanToken, decryptPanToken } from "../../core/security/crypto.util";
import type { PanDetailsInput, PanDetailsOutput, PanFindOutput } from "./pan.schema";

export class PanService {
  /**
   * 1. Find PAN Number by 12-digit Aadhaar
   * Returns ONLY masked PAN + stateless encrypted token (No cleartext PAN leak)
   */
  async findPanByAadhaar(aadhaar: string): Promise<PanFindOutput> {
    logger.info(
      `[PanService] Finding PAN for Aadhaar ending in ${aadhaar.slice(-4)}`,
    );

    // CASHFREE & PROVIDER SIMULATION TEST BYPASS
    if (aadhaar === "123412341234") {
      logger.info(`[PanService] Test Aadhaar (Success Mode) detected. Returning mock token.`);
      return {
        maskedPan: "XXXXX1234X",
        searchToken: encryptPanToken({
          pan: "ABCDE1234F",
          aadhaarMasked: "XXXXXXXX1234",
        }),
      };
    }

    if (aadhaar === "999999999999") {
      logger.info(`[PanService] Test Aadhaar (Error Simulation Mode) detected. Returning error test token.`);
      return {
        maskedPan: "XXXXX9999E",
        searchToken: encryptPanToken({
          pan: "ERRBAL9999E",
          aadhaarMasked: "XXXXXXXX9999",
        }),
      };
    }

    const response = await ezytmPanGateway.findPanByAadhaar(aadhaar);
    logger.info(`[PanService] Raw response received: ${JSON.stringify(response)}`);

    const panNumber = response.Data?.PanNumber?.trim()?.toUpperCase();

    if (response.Errorcode === 100) {
      if (panNumber) {
        const maskedPan = `XXXXX${panNumber.substring(5, 9)}${panNumber.substring(9)}`;
        const searchToken = encryptPanToken({
          pan: panNumber,
          aadhaarMasked: `XXXXXXXX${aadhaar.slice(-4)}`,
        });
        logger.info(`[PanService] Successfully matched PAN (Masked: ${maskedPan}, Token Encrypted)`);

        return {
          maskedPan,
          searchToken,
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
   * Accepts encrypted searchToken or unmasked PAN
   */
  async getPanDetails(input: PanDetailsInput | string): Promise<PanDetailsOutput> {
    let cleanPan = "";

    if (typeof input === "string") {
      cleanPan = input.trim().toUpperCase();
    } else if (input.searchToken) {
      const decrypted = decryptPanToken(input.searchToken);
      cleanPan = decrypted.pan.trim().toUpperCase();
    } else if (input.pan) {
      cleanPan = input.pan.trim().toUpperCase();
    }

    if (!cleanPan) {
      throw AppError.badRequest("A valid searchToken or PAN number is required.", "INVALID_INPUT");
    }

    // CASHFREE & PROVIDER SIMULATION TEST BYPASS
    if (cleanPan === "ABCDE1234F") {
      logger.info(`[PanService] Test PAN (Success Mode) detected. Returning mock details.`);
      return {
        pan: "ABCDE1234F",
        fullName: "Mock Test User",
        maskedAadhaar: "XXXXXXXX1234",
        dob: "1990-01-01",
        gender: "Male (M)",
        aadhaarLinked: true,
        category: "Individual"
      };
    }

    if (cleanPan === "ERRBAL9999E") {
      logger.info(`[PanService] Test PAN (Insufficient Balance Simulation) detected.`);
      throw AppError.badRequest("Insufficient balance.", "PAN_DETAILS_FAILED");
    }

    if (cleanPan === "ERRTOUT9999E") {
      logger.info(`[PanService] Test PAN (Timeout Simulation) detected.`);
      throw AppError.badRequest("Verification provider gateway timed out. Please try again.", "PAN_DETAILS_FAILED");
    }

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
