import { ezytmRcGateway } from "../../core/integrations/ezytm/ezytm-rc.gateway";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { redis } from "../../core/redis/redis.client";
import { getDummyRcDetails, getDummyMobileToRc, getDummyRcOwnerHistory } from "./rc.dummy";
import { vendorWalletService } from "../admin/vendor-wallet.service";
import type { RcDetailsData, VerifyRcOutput, MobileToRcData, VerifyMobileToRcOutput, RcOwnerHistoryData } from "./rc.schema";

export class RcService {
  /**
   * 1. Get Comprehensive RC Details
   * Strictly intercepts dummy test numbers before calling live upstream PlainAPI.
   */
  async getRcDetails(vehicleNumber: string): Promise<RcDetailsData> {
    const cleanNumber = vehicleNumber.replace(/[\s\-_]/g, "").toUpperCase();

    logger.info(`[RcService] Querying RC details for vehicle: ${cleanNumber}`);

    // DUMMY SIMULATION BYPASS (Zero Vendor Wallet Deduction)
    if (cleanNumber === "DL01AB1234") {
      logger.info(
        `[RcService] Test vehicle number DL01AB1234 detected. Returning mock RC details.`
      );
      return getDummyRcDetails(cleanNumber);
    }

    // 24-HOUR REDIS CACHE CHECK (DPDP & cost saving)
    const cacheKey = `cache:rc_details:${cleanNumber}`;
    const cached = await redis.getJson<RcDetailsData>(cacheKey);
    if (cached && cached.owner_name && cached.owner_name !== "N/A") {
      logger.info(`[RcService] Cache HIT for RC: ${cleanNumber}`);
      return cached;
    }

    // CALL LIVE UPSTREAM (PlainAPI / EzyTM)
    try {
      const response = await ezytmRcGateway.getRcDetails(cleanNumber);

      if (!response) {
        throw new AppError("No response received from transport registry", 502);
      }

      if (response.Errorcode !== 100) {
        let errorMsg =
          response.Message ||
          response.message ||
          "Vehicle Registration Certificate (RC) details not found in government registry";
        if (errorMsg === "Internal Server Error") {
          errorMsg = "Government transport registry (Vahan) returned an error or vehicle details not found";
        }
        throw new AppError(errorMsg, 404, "RC_NOT_FOUND");
      }

      const rawData = response.response || response.data || response.Data || response.result || response;

      const formatted: RcDetailsData = {
        rc_number: rawData.rc_number || rawData.license_plate || rawData.VehicleNumber || rawData.vehicleNumber || cleanNumber,
        registration_date: rawData.registration_date || rawData.reg_date || rawData.RegistrationDate || rawData.regDate || "N/A",
        owner_name: rawData.owner_name || rawData.OwnerName || rawData.owner || rawData.Owner || "N/A",
        father_name: rawData.father_name || rawData.fatherName || rawData.FatherName || rawData.Father || "N/A",
        present_address: rawData.present_address || rawData.address || rawData.PresentAddress || rawData.Address || "N/A",
        permanent_address: rawData.permanent_address || rawData.PermanentAddress || rawData.address || "N/A",
        mobile_number: rawData.mobile_number || rawData.MobileNo || rawData.Mobile || "",
        vehicle_category: rawData.vehicle_category || rawData.category || rawData.classs || rawData.VehicleClass || rawData.vehicle_class || "N/A",
        vehicle_chasi_number: rawData.vehicle_chasi_number || rawData.chassis_number || rawData.chasi_number || rawData.ChassisNumber || rawData.ChasiNumber || "N/A",
        vehicle_engine_number: rawData.vehicle_engine_number || rawData.engine_number || rawData.EngineNumber || "N/A",
        maker_description: rawData.maker_description || rawData.maker || rawData.Maker || rawData.Manufacturer || "N/A",
        maker_model: rawData.maker_model || rawData.model || rawData.MakerModel || rawData.Model || "N/A",
        body_type: rawData.body_type || rawData.BodyType || "N/A",
        fuel_type: rawData.fuel_type || rawData.fuel || rawData.FuelType || rawData.Fuel || "N/A",
        color: rawData.color || rawData.Color || rawData.vehicle_color || "N/A",
        norms_type: rawData.norms_type || rawData.norms || rawData.NormsType || "N/A",
        fit_up_to: rawData.fit_up_to || rawData.fitness_upto || rawData.FitnessUpto || rawData.fitness_expiry || "N/A",
        financer: rawData.financer || rawData.Financer || (rawData.financed || rawData.is_financed ? "Yes" : "None"),
        financed: Boolean(rawData.financed || rawData.is_financed),
        insurance_company: rawData.insurance_company || rawData.insurance_comp || rawData.InsuranceCompany || "N/A",
        insurance_policy_number: rawData.insurance_policy_number || rawData.policy_no || rawData.insurance_policy || rawData.PolicyNo || "N/A",
        insurance_upto: rawData.insurance_upto || rawData.insurance_valid_upto || rawData.insurance_expiry || rawData.InsuranceUpto || "N/A",
        manufacturing_date: rawData.manufacturing_date || rawData.ManufacturingDate || "N/A",
        manufacturing_date_formatted: rawData.manufacturing_date_formatted || rawData.manufacturing_date || "N/A",
        registered_at: rawData.registered_at || rawData.rto || rawData.RTO || rawData.RegisteredAt || "N/A",
        latest_by: rawData.latest_by,
        less_info: Boolean(rawData.less_info),
        tax_upto: rawData.tax_upto || rawData.TaxUpto || null,
        tax_paid_upto: rawData.tax_paid_upto || rawData.TaxPaidUpto || null,
        cubic_capacity: String(rawData.cubic_capacity || rawData.cc || rawData.CubicCapacity || "N/A"),
        vehicle_gross_weight: String(rawData.vehicle_gross_weight || rawData.gross_weight || rawData.GrossWeight || "N/A"),
        no_cylinders: String(rawData.no_cylinders || rawData.cylinders || rawData.NoOfCylinders || "N/A"),
        seat_capacity: String(rawData.seat_capacity || rawData.seating || rawData.SeatCapacity || "N/A"),
        sleeper_capacity: rawData.sleeper_capacity || null,
        standing_capacity: rawData.standing_capacity || null,
        wheelbase: String(rawData.wheelbase || rawData.Wheelbase || "N/A"),
        unladen_weight: String(rawData.unladen_weight || rawData.UnladenWeight || "N/A"),
        vehicle_category_description: rawData.vehicle_category_description || rawData.vehicle_category || rawData.classs || "N/A",
        pucc_number: rawData.pucc_number || rawData.PuccNumber || "N/A",
        pucc_upto: rawData.pucc_upto || rawData.PuccUpto || null,
        permit_number: rawData.permit_number || null,
        permit_issue_date: rawData.permit_issue_date || null,
        permit_valid_from: rawData.permit_valid_from || null,
        permit_valid_upto: rawData.permit_valid_upto || null,
        permit_type: rawData.permit_type || null,
        national_permit_number: rawData.national_permit_number || null,
        national_permit_upto: rawData.national_permit_upto || null,
        national_permit_issued_by: rawData.national_permit_issued_by || null,
        non_use_status: rawData.non_use_status || null,
        non_use_from: rawData.non_use_from || null,
        non_use_to: rawData.non_use_to || null,
        blacklist_status: rawData.blacklist_status || rawData.BlacklistStatus || "No",
        noc_details: rawData.noc_details || null,
        owner_number: String(rawData.owner_number || rawData.OwnerNumber || "1"),
        rc_status: rawData.rc_status || rawData.status || rawData.Status || "ACTIVE",
        masked_name: Boolean(rawData.masked_name),
        challan_details: rawData.challan_details || null,
        variant: rawData.variant || null,
      };

      // Gated Vendor Wallet Deduction: ONLY runs on confirmed live upstream success (₹2.25 per hit)
      vendorWalletService
        .deductApiCost({
          serviceCode: "VEHICLE_LOOKUP",
          unitCost: 2.25,
          reference: formatted.rc_number,
        })
        .catch((err) => {
          logger.error("[RcService] Failed to deduct vendor wallet for VEHICLE_LOOKUP:", err);
        });

      // Cache successful response for 24 hours only if valid owner details exist
      if (formatted.owner_name && formatted.owner_name !== "N/A") {
        await redis.setJson(cacheKey, formatted, 86400);
      }

      return formatted;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : "Transport registry lookup failed";
      logger.error(`[RcService] Live PlainAPI RC lookup error: ${msg}`, err);
      throw new AppError(msg, 502, "UPSTREAM_GATEWAY_ERROR");
    }
  }

  /**
   * 2. Pre-Verification for UI validation
   */
  async verifyRc(vehicleNumber: string): Promise<VerifyRcOutput> {
    const cleanNumber = vehicleNumber.replace(/[\s\-_]/g, "").toUpperCase();

    if (cleanNumber === "DL01AB1234") {
      return {
        vehicleNumber: cleanNumber,
        ownerNameMasked: "M**** B*****",
        makerModel: "EICHER PRO BSIV",
        fuelType: "DIESEL",
        status: "ACTIVE",
      };
    }

    // Call getRcDetails or quick return
    const details = await this.getRcDetails(cleanNumber);
    const words = details.owner_name.split(" ");
    const maskedWords = words.map((w) => (w.length > 1 ? `${w[0]}${"*".repeat(w.length - 1)}` : w));

    return {
      vehicleNumber: details.rc_number,
      ownerNameMasked: maskedWords.join(" "),
      makerModel: `${details.maker_description} ${details.maker_model}`.trim(),
      fuelType: details.fuel_type,
      status: details.rc_status || "ACTIVE",
    };
  }

  /**
   * 3. Get Mobile To RC (Linked Vehicle Registrations)
   */
  async getMobileToRc(mobileNumber: string): Promise<MobileToRcData> {
    const cleanMobile = mobileNumber.trim().replace(/\D/g, "");
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new AppError("Mobile number must be a valid 10-digit number", 400);
    }

    logger.info(`[RcService] Querying Mobile To RC for: ${cleanMobile}`);

    // DUMMY SIMULATION BYPASS
    if (cleanMobile === "1234567890") {
      logger.info(
        `[RcService] Test mobile 1234567890 detected. Returning mock MobileToRC format without external API call.`
      );
      return getDummyMobileToRc(cleanMobile);
    }

    // 24-HOUR REDIS CACHE CHECK
    const cacheKey = `cache:mobile_to_rc:${cleanMobile}`;
    const cached = await redis.getJson<MobileToRcData>(cacheKey);
    if (cached) {
      logger.info(`[RcService] Cache HIT for MobileToRC: ${cleanMobile}`);
      return cached;
    }

    // CALL LIVE UPSTREAM (PlanAPI / EzyTM)
    try {
      const response = await ezytmRcGateway.getMobileToRc(cleanMobile);
      if (!response) {
        throw new AppError("No response received from transport registry", 502);
      }

      if (response.Errorcode !== 100) {
        let errorMsg =
          response.Message ||
          response.message ||
          "No vehicle registrations found linked with this mobile number in government registry";
        if (errorMsg === "Internal Server Error") {
          errorMsg = "Government transport registry (Vahan) returned an error or no vehicles are linked to this mobile number";
        }
        throw new AppError(errorMsg, 404, "VEHICLE_NOT_FOUND");
      }

      const rawData = response.data || response.Data || response;
      let rcList: string[] = [];
      if (Array.isArray(rawData.rc_number)) {
        rcList = rawData.rc_number.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean);
      } else if (typeof rawData.rc_number === "string" && rawData.rc_number.trim()) {
        rcList = rawData.rc_number.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      } else if (Array.isArray(rawData.rcNumbers)) {
        rcList = rawData.rcNumbers.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean);
      }

      if (rcList.length === 0) {
        const errorMsg =
          response.Message ||
          response.message ||
          "No connected vehicle registrations found for this mobile number";
        throw new AppError(errorMsg, 404, "VEHICLE_NOT_FOUND");
      }

      const formatted: MobileToRcData = {
        mobile_number: String(rawData.mobile_number || cleanMobile),
        rc_number: rcList,
        total_vehicles: rcList.length,
      };

      // Gated Vendor Wallet Deduction: ONLY runs on confirmed live upstream success (₹8.15 per hit)
      vendorWalletService
        .deductApiCost({
          serviceCode: "MOBILE_TO_RC",
          unitCost: 8.15,
          reference: `Mobile ending in ${cleanMobile.slice(-4)}`,
        })
        .catch((err) => {
          logger.error("[RcService] Failed to deduct vendor wallet for MOBILE_TO_RC:", err);
        });

      await redis.setJson(cacheKey, formatted, 86400);
      return formatted;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : "Transport registry lookup failed";
      logger.error(`[RcService] Mobile to RC lookup error: ${msg}`, err);
      throw new AppError(msg, 502, "UPSTREAM_GATEWAY_ERROR");
    }
  }

  /**
   * 4. Pre-Verification for Mobile To RC UI validation
   */
  async verifyMobileToRc(mobileNumber: string): Promise<VerifyMobileToRcOutput> {
    const cleanMobile = mobileNumber.trim().replace(/\D/g, "");
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new AppError("Mobile number must be a valid 10-digit number", 400);
    }

    if (cleanMobile === "1234567890") {
      return {
        mobileNumber: cleanMobile,
        vehicleCount: 2,
        status: "FOUND",
      };
    }

    const data = await this.getMobileToRc(cleanMobile);
    return {
      mobileNumber: data.mobile_number,
      vehicleCount: data.rc_number.length,
      status: "FOUND",
    };
  }

  /**
   * 5. Get RC Owner History
   */
  async getRcOwnerHistory(vehicleNumber: string): Promise<RcOwnerHistoryData> {
    const cleanNumber = vehicleNumber.replace(/[\s\-_]/g, "").toUpperCase();

    logger.info(`[RcService] Querying RC Owner History for vehicle: ${cleanNumber}`);

    // DUMMY SIMULATION BYPASS
    if (cleanNumber === "DL01AB1234") {
      logger.info(
        `[RcService] Test vehicle number DL01AB1234 detected. Returning mock RcOwnerHistory format.`
      );
      return getDummyRcOwnerHistory(cleanNumber);
    }

    // 24-HOUR REDIS CACHE CHECK
    const cacheKey = `cache:rc_owner_history:${cleanNumber}`;
    const cached = await redis.getJson<RcOwnerHistoryData>(cacheKey);
    if (cached) {
      logger.info(`[RcService] Cache HIT for RcOwnerHistory: ${cleanNumber}`);
      return cached;
    }

    // CALL LIVE UPSTREAM (PlanAPI / EzyTM)
    try {
      const response = await ezytmRcGateway.getRcOwnerHistory(cleanNumber);
      if (!response) {
        throw new AppError("No response received from transport registry", 502);
      }

      if (response.Errorcode !== 100) {
        let errorMsg =
          response.Message ||
          response.message ||
          "No owner history found for this vehicle in government registry";
        if (errorMsg.includes("Internal Server Error")) {
          errorMsg = "Government transport registry (Vahan) returned an error or vehicle owner history not found. Please try again later.";
        }
        throw new AppError(errorMsg, 404, "RECORD_NOT_FOUND");
      }

      const rawData = response.data || response.Data || response;
      let historyList: any[] = [];
      if (Array.isArray(rawData.owner_history)) {
        historyList = rawData.owner_history.map((item: any) => ({
          owner_name: String(item.owner_name || item.name || "").trim().toUpperCase(),
          owner_number: String(item.owner_number || item.number || "1").trim(),
        }));
      }

      const formatted: RcOwnerHistoryData = {
        rc_number: String(rawData.rc_number || cleanNumber).toUpperCase(),
        current_owner_number: String(rawData.current_owner_number || (historyList.length ? historyList[historyList.length - 1].owner_number : "1")),
        current_owner_name: String(rawData.current_owner_name || (historyList.length ? historyList[historyList.length - 1].owner_name : "")),
        owner_history: historyList,
      };

      // Gated Vendor Wallet Deduction: ONLY runs on confirmed live upstream success (₹7.50 per hit)
      vendorWalletService
        .deductApiCost({
          serviceCode: "RC_OWNER_HISTORY",
          unitCost: 7.50,
          reference: formatted.rc_number,
        })
        .catch((err) => {
          logger.error("[RcService] Failed to deduct vendor wallet for RC_OWNER_HISTORY:", err);
        });

      await redis.setJson(cacheKey, formatted, 86400);
      return formatted;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : "Transport registry owner history lookup failed";
      logger.error(`[RcService] RC owner history error: ${msg}`, err);
      throw new AppError(msg, 502, "UPSTREAM_GATEWAY_ERROR");
    }
  }
}

export const rcService = new RcService();
