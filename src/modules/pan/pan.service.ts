import { ezytmPanGateway } from "../../core/integrations/ezytm/ezytm-pan.gateway";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { encryptPanToken, decryptPanToken } from "../../core/security/crypto.util";
import { redis } from "../../core/redis/redis.client";
import { brevoMailService } from "../../core/mail/brevo.service";
import { vendorWalletService } from "../admin/vendor-wallet.service";
import type {
  DecryptPanTokenOutput,
  PanDetailsInput,
  PanDetailsOutput,
  PanFindOutput,
  PanToAadhaarDetailsOutput,
  PanToAadhaarVerifyOutput,
  VerifyPanDetailsOutput,
} from "./pan.schema";

function isVendorLowBalance(errorcode?: number, message?: string): boolean {
  if (errorcode === 104) return true;
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("insufficient") ||
    lower.includes("low balance") ||
    lower.includes("balance low") ||
    lower.includes("wallet balance") ||
    lower.includes("recharge") ||
    lower.includes("credit limit")
  );
}

async function checkAndTriggerVendorLowBalanceAlert(params: {
  serviceCode: string;
  serviceName: string;
  vendorError: string;
}) {
  const lockKey = `alert:vendor_low_balance_lock:${params.serviceCode}`;
  try {
    const isLocked = await redis.get(lockKey);
    if (isLocked) {
      logger.info(`[VendorBalanceAlert] Alert already throttled for ${params.serviceCode}. Skipping duplicate email.`);
      return;
    }

    // 15-minute throttle lock (900 seconds)
    await redis.set(lockKey, "1", 900);

    // Strict safety check: only send real live alert if explicit flag is enabled
    // Prevents any automatic email dispatch until explicitly authorized by user
    if (process.env.ENABLE_VENDOR_BALANCE_ALERTS === "true") {
      logger.info(`[VendorBalanceAlert] Dispatching live low balance alert to admin for ${params.serviceCode}`);
      await brevoMailService.sendLowBalanceAdminAlert({
        serviceCode: params.serviceCode,
        serviceName: params.serviceName,
        vendorError: params.vendorError,
        rechargeUrl: "https://planapi.in",
      });
    } else {
      logger.warn(`[VendorBalanceAlert] Low balance detected for ${params.serviceCode} (${params.vendorError}). Live email alert is currently in PREVIEW/TEST mode (ENABLE_VENDOR_BALANCE_ALERTS is not enabled).`);
    }
  } catch (err) {
    logger.error(`[VendorBalanceAlert] Failed to handle balance alert:`, err);
  }
}

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
      logger.info(`[PanService] Test Aadhaar (Success Simulation) detected. Encrypting mock token.`);
      return {
        maskedPan: "XXXXX1234F",
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

    // In-flight automatic company vendor wallet deduction (₹2.50 per hit)
    vendorWalletService
      .deductApiCost({
        serviceCode: "PAN_FIND",
        unitCost: 2.5,
        reference: `Aadhaar ending in ${aadhaar.slice(-4)}`,
      })
      .catch((err) => {
        logger.error("[PanService] Failed to deduct wallet balance for PAN_FIND:", err);
      });

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

    if (isVendorLowBalance(response.Errorcode, response.Message)) {
      logger.error(`[PanService] Vendor balance error detected in findPanByAadhaar: ${response.Message} (Code ${response.Errorcode})`);
      checkAndTriggerVendorLowBalanceAlert({
        serviceCode: "PAN_FIND",
        serviceName: "Aadhaar to PAN Find",
        vendorError: `Errorcode ${response.Errorcode}: ${response.Message || "Insufficient balance"}`,
      }).catch(() => {});

      throw AppError.badRequest(
        "सरकारी पैन गेटवे वर्तमान में व्यस्त या मेंटेनेंस मोड पर है। कृपया 10–15 मिनट बाद पुनः प्रयास करें।",
        "GATEWAY_MAINTENANCE"
      );
    }

    if (response.Errorcode === 101) {
      logger.warn(`[PanService] PAN not found / Errorcode 101 for Aadhaar ending in ${aadhaar.slice(-4)}`);
      throw AppError.badRequest("No PAN Card record found linked with this Aadhaar number in the Income Tax registry.", "PAN_NOT_FOUND");
    }

    const fallbackMsg = (response.Message && response.Message !== "Data Fetch Successfully" && response.Message !== "Internal Server Error")
      ? response.Message
      : "Failed to find PAN for this Aadhaar. The upstream government registry is temporarily unreachable.";

    logger.warn(`[PanService] Find PAN failed: ${fallbackMsg}`);
    throw AppError.badRequest(fallbackMsg, "PAN_FIND_FAILED");
  }

  /**
   * 2. Fetch Comprehensive PAN Details
   * Accepts encrypted searchToken or unmasked PAN
   */
  async getPanDetails(input: PanDetailsInput | string): Promise<PanDetailsOutput> {
    let cleanPan = "";
    let decryptedAadhaarMasked = "";

    if (typeof input === "string") {
      if (input.includes(".") && input.length > 20) {
        const decrypted = decryptPanToken(input);
        cleanPan = decrypted.pan.trim().toUpperCase();
        decryptedAadhaarMasked = decrypted.aadhaarMasked || "";
      } else {
        cleanPan = input.trim().toUpperCase();
      }
    } else if (input.searchToken) {
      const decrypted = decryptPanToken(input.searchToken);
      cleanPan = decrypted.pan.trim().toUpperCase();
      decryptedAadhaarMasked = decrypted.aadhaarMasked || "";
    } else if (input.pan) {
      if (input.pan.includes(".") && input.pan.length > 20) {
        const decrypted = decryptPanToken(input.pan);
        cleanPan = decrypted.pan.trim().toUpperCase();
        decryptedAadhaarMasked = decrypted.aadhaarMasked || "";
      } else {
        cleanPan = input.pan.trim().toUpperCase();
      }
    }

    if (!cleanPan) {
      throw AppError.badRequest("A valid searchToken or PAN number is required.", "INVALID_INPUT");
    }

    // CASHFREE & PROVIDER SIMULATION TEST BYPASS
    if (cleanPan === "ABCDE1234F") {
      logger.info(`[PanService] Test PAN (Success Simulation) decrypted. Returning verified details.`);
      return {
        pan: "ABCDE1234F",
        fullName: "VIKASH KUMAR",
        maskedAadhaar: decryptedAadhaarMasked || "XXXXXXXX1234",
        dob: "1995-08-15",
        gender: "Male (M)",
        aadhaarLinked: true,
        category: "Individual",
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

    // In-flight automatic company vendor wallet deduction (₹2.00 per hit)
    vendorWalletService
      .deductApiCost({
        serviceCode: "PAN_DETAILS",
        unitCost: 2.0,
        reference: `PAN ending in ${cleanPan.slice(-4)}`,
      })
      .catch((err) => {
        logger.error("[PanService] Failed to deduct wallet balance for PAN_DETAILS:", err);
      });

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

    if (isVendorLowBalance(response.Errorcode, failureReason)) {
      logger.error(`[PanService] Vendor balance error detected in getPanDetails: ${failureReason} (Code ${response.Errorcode})`);
      checkAndTriggerVendorLowBalanceAlert({
        serviceCode: "PAN_DETAILS",
        serviceName: "Comprehensive PAN Verification",
        vendorError: `Errorcode ${response.Errorcode}: ${failureReason}`,
      }).catch(() => {});

      throw AppError.badRequest(
        "सरकारी गेटवे वर्तमान में व्यस्त या मेंटेनेंस मोड पर है। कृपया 10–15 मिनट बाद पुनः प्रयास करें।",
        "GATEWAY_MAINTENANCE"
      );
    }

    logger.warn(`[PanService] Fetch PAN details failed: ${failureReason}`);
    throw AppError.badRequest(failureReason, "PAN_DETAILS_FAILED");
  }

  /**
   * 3. Decrypt stateless search token to reveal PAN and Masked Aadhaar
   */
  decryptSearchToken(token: string): DecryptPanTokenOutput {
    try {
      const decrypted = decryptPanToken(token);
      if (!decrypted?.pan) {
        throw new Error("Missing PAN in decrypted token payload");
      }
      return {
        pan: decrypted.pan,
        maskedAadhaar: decrypted.aadhaarMasked || "XXXXXXXX",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PanService] Token decryption failed: ${msg}`);
      throw AppError.badRequest(
        "Invalid or expired search session token. Please search again.",
        "INVALID_TOKEN",
      );
    }
  }

  /**
   * 4. Verify PAN Details & Tokenize (Pre-Payment Availability Check)
   */
  async verifyPanDetails(pan: string): Promise<VerifyPanDetailsOutput> {
    const formattedPan = pan.trim().toUpperCase();
    logger.info(`[PanService] Verifying PAN availability for: ${formattedPan}`);

    // Simulation check for test PANs
    if (formattedPan === "ABCDE1234F") {
      const searchToken = encryptPanToken({
        pan: "ABCDE1234F",
        fullName: "VIKASH KUMAR",
        dob: "1995-08-15",
        gender: "Male (M)",
        category: "Individual",
        aadhaarLinked: true,
        aadhaarMasked: "XXXXXXXX1234",
      });
      return {
        pan: "ABCDE1234F",
        maskedName: "V**** K****",
        searchToken,
      };
    }

    const details = await this.getPanDetails(formattedPan);
    const searchToken = encryptPanToken({
      pan: details.pan,
      fullName: details.fullName,
      dob: details.dob,
      gender: details.gender,
      category: details.category,
      aadhaarLinked: details.aadhaarLinked,
      aadhaarMasked: details.maskedAadhaar,
    });

    const maskedName = details.fullName
      ? details.fullName
          .split(" ")
          .map((part) => (part.length > 1 ? `${part[0]}****` : part))
          .join(" ")
      : "V****";

    return {
      pan: details.pan,
      maskedName,
      searchToken,
    };
  }

  /**
   * 5. Decrypt details token to reveal full demographic records
   */
  decryptPanDetailsToken(token: string): PanDetailsOutput {
    try {
      const decrypted = decryptPanToken(token);
      if (!decrypted?.pan) {
        throw new Error("Missing PAN in token");
      }
      return {
        pan: decrypted.pan,
        fullName: decrypted.fullName || "Taxpayer",
        dob: decrypted.dob || "N/A",
        gender: decrypted.gender || "N/A",
        category: decrypted.category || "Individual",
        aadhaarLinked: decrypted.aadhaarLinked ?? true,
        maskedAadhaar: decrypted.aadhaarMasked || "N/A",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PanService] Details token decryption failed: ${msg}`);
      throw AppError.badRequest(
        "Invalid or expired verification session token. Please search again.",
        "INVALID_TOKEN",
      );
    }
  }

  /**
   * 6. Advance PAN to Aadhaar Inquiry & Tokenization
   * Pre-payment: ONLY returns masked Aadhaar, PAN, and encrypted searchToken.
   * Remaining data (fullName, dob, gender) is encrypted in searchToken.
   */
  async verifyPanToAadhaar(pan: string): Promise<PanToAadhaarVerifyOutput> {
    const formattedPan = pan.trim().toUpperCase();
    logger.info(`[PanService] Verifying Advance PAN to Aadhaar for: ${formattedPan}`);

    // TEST CONDITION: If Pan_number === ABCDE1234F return test details (only masked aadhaar, remaining data encrypted)
    if (formattedPan === "ABCDE1234F") {
      logger.info(`[PanService] Test PAN ABCDE1234F detected. Returning masked Aadhaar with encrypted details.`);
      const searchToken = encryptPanToken({
        pan: "ABCDE1234F",
        aadharNumber: "321098765432",
        fullName: "VIKASH KUMAR",
        dob: "1995-08-15",
        gender: "Male",
      });

      return {
        pan: "ABCDE1234F",
        maskedAadhaar: "32XXXXXXXXXX",
        searchToken,
      };
    }

    const response = await ezytmPanGateway.getAdvancePanToAadhaar(formattedPan);
    console.log(`[PanService] Raw AdvancePanToAadhaar response: ${JSON.stringify(response)}`);
    logger.info(`[PanService] Raw AdvancePanToAadhaar response: ${JSON.stringify(response)}`);

    // In-flight automatic company vendor wallet deduction (₹5.00 per hit)
    vendorWalletService
      .deductApiCost({
        serviceCode: "PAN_TO_AADHAAR",
        unitCost: 5.0,
        reference: `PAN ending in ${formattedPan.slice(-4)}`,
      })
      .catch((err) => {
        logger.error("[PanService] Failed to deduct wallet balance for PAN_TO_AADHAAR:", err);
      });

    if (response.Errorcode === 100 && response.Data) {
      const d = response.Data;
      const cleanPanNumber = (d.PanNumber || formattedPan).trim().toUpperCase();
      const rawAadhaar = String(
        (d as any).AadharNumber ||
        (d as any).AadhaarNumber ||
        (d as any).Aadhaar ||
        (d as any).Aadhar ||
        ""
      ).trim();

      const vendorMaskedAadhaar = String(
        d.MaskedAadhaar || (d as any).maskedAadhaar || ""
      ).trim();

      const maskedAadhaar = vendorMaskedAadhaar && vendorMaskedAadhaar.toLowerCase() !== "null"
        ? vendorMaskedAadhaar
        : rawAadhaar && rawAadhaar.length === 12
        ? `${rawAadhaar.substring(0, 2)}XXXXXXXX${rawAadhaar.substring(10)}`
        : "";

      const fullName =
        d.FullName ||
        [d.FirstName, d.MiddleName, d.LastName].filter(Boolean).join(" ").trim() ||
        "";

      const dob = d.Dob || "";
      const gender = d.Gender === "M"
        ? "Male"
        : d.Gender === "F"
        ? "Female"
        : (d.Gender || "");

      // STRICT VALIDATION: If no valid Aadhaar number/masked Aadhaar was returned,
      // or if AadhaarLinked is explicitly false, or if all fields are null/empty,
      // it means this PAN card has NO linked Aadhaar in the government database.
      // NEVER return dummy data in production!
      const hasAadhaarData = Boolean(
        (maskedAadhaar && maskedAadhaar !== "" && maskedAadhaar.toLowerCase() !== "null") ||
        (rawAadhaar && rawAadhaar !== "" && rawAadhaar.toLowerCase() !== "null")
      );

      if (!hasAadhaarData || d.AadhaarLinked === false) {
        logger.warn(`[PanService] Advance PAN to Aadhaar returned no linked Aadhaar for PAN ${formattedPan}. AadhaarLinked: ${d.AadhaarLinked}, MaskedAadhaar: ${d.MaskedAadhaar}`);
        throw AppError.badRequest(
          "No Aadhaar record found linked with this PAN card in the Income Tax database.",
          "PAN_NOT_FOUND",
        );
      }

      // Encrypt full demographic data into token
      const searchToken = encryptPanToken({
        pan: cleanPanNumber,
        aadharNumber: rawAadhaar || maskedAadhaar,
        fullName: fullName || "N/A",
        dob: dob || "N/A",
        gender: gender || "N/A",
      });

      // ONLY return masked Aadhaar, PAN, and encrypted searchToken
      return {
        pan: cleanPanNumber,
        maskedAadhaar,
        searchToken,
      };
    }

    if (isVendorLowBalance(response.Errorcode, response.Message)) {
      logger.error(`[PanService] Vendor balance error detected in getAdvancePanToAadhaar: ${response.Message} (Code ${response.Errorcode})`);
      checkAndTriggerVendorLowBalanceAlert({
        serviceCode: "PAN_TO_AADHAAR",
        serviceName: "Advance PAN to Aadhaar",
        vendorError: `Errorcode ${response.Errorcode}: ${response.Message || "Insufficient balance"}`,
      }).catch(() => {});

      throw AppError.badRequest(
        "सरकारी गेटवे वर्तमान में व्यस्त या मेंटेनेंस मोड पर है। कृपया 10–15 मिनट बाद पुनः प्रयास करें।",
        "GATEWAY_MAINTENANCE"
      );
    }

    if (response.Errorcode === 101) {
      throw AppError.badRequest(
        response.Message || "No record found linked with this PAN in the registry.",
        "PAN_NOT_FOUND",
      );
    }

    const fallbackMsg = response.Message || "Failed to retrieve Aadhaar details linked with this PAN. Please check the PAN number.";
    throw AppError.badRequest(fallbackMsg, "PAN_TO_AADHAAR_FAILED");
  }

  /**
   * 7. Decrypt Advance PAN to Aadhaar token once payment is done
   * Returns ONLY: aadhar number, Full name, Dob and gender
   */
  decryptPanToAadhaarToken(token: string): PanToAadhaarDetailsOutput {
    try {
      const d = decryptPanToken(token);
      if (!d?.pan) {
        throw new Error("Missing PAN in token");
      }
      return {
        pan: d.pan.trim().toUpperCase(),
        aadharNumber: (d.aadharNumber as string) || (d.aadhaarMasked as string) || "",
        fullName: (d.fullName as string) || "N/A",
        dob: (d.dob as string) || "N/A",
        gender: (d.gender as string) || "N/A",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[PanService] Advance PAN to Aadhaar token decryption failed: ${msg}`);
      throw AppError.badRequest(
        "Invalid or expired verification session token. Please search again.",
        "INVALID_TOKEN",
      );
    }
  }

  /**
   * 8. Direct retrieval for ServiceDispatcher fulfillment
   */
  async getAdvancePanToAadhaar(pan: string): Promise<PanToAadhaarDetailsOutput> {
    const verified = await this.verifyPanToAadhaar(pan);
    return this.decryptPanToAadhaarToken(verified.searchToken);
  }
}

export const panService = new PanService();
