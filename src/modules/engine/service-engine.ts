import { panService } from "../pan/pan.service";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";

export interface ServiceExecutionResult {
  success: boolean;
  providerId?: string;
  referenceNumber?: string;
  resultData?: Record<string, unknown>;
  error?: string;
}

export class ServiceEngine {
  /**
   * Validates service-specific input payload before dispatching.
   */
  validateServiceInput(serviceCode: string, inputData: Record<string, unknown>) {
    if (serviceCode === "PAN_FIND") {
      const aadhaar = String(inputData.aadhaar || "").trim();
      if (!aadhaar || !/^\d{12}$/.test(aadhaar)) {
        throw AppError.badRequest(
          "Invalid Aadhaar number. Must be exactly 12 digits.",
          "INVALID_INPUT",
        );
      }
    } else if (serviceCode === "VOTER_VERIFY") {
      const epic = String(inputData.epicNumber || "").trim();
      if (!epic || epic.length < 5) {
        throw AppError.badRequest(
          "Invalid EPIC/Voter ID number format.",
          "INVALID_INPUT",
        );
      }
    }
  }

  /**
   * Executes service workflow directly by delegating to domain service handlers.
   */
  async executeService(
    serviceCode: string,
    inputData: Record<string, unknown>,
  ): Promise<ServiceExecutionResult> {
    this.validateServiceInput(serviceCode, inputData);

    logger.info(`ServiceEngine executing service: ${serviceCode}`);

    try {
      if (serviceCode === "PAN_FIND") {
        const aadhaar = String(inputData.aadhaar || "").trim();
        const panResult = await panService.findPanByAadhaar(aadhaar);

        return {
          success: true,
          providerId: "EZYTM",
          referenceNumber: `REQ-${Date.now()}`,
          resultData: {
            pan: panResult.pan,
            panNumber: panResult.pan,
            maskedPan: panResult.maskedPan,
            status: "ACTIVE",
          },
        };
      }

      if (serviceCode === "VOTER_VERIFY") {
        const epicNumber = String(inputData.epicNumber || "ABC1234567");
        return {
          success: true,
          providerId: "SYSTEM",
          referenceNumber: `VTR-${Date.now()}`,
          resultData: {
            epicNumber,
            fullName: "VIKASH KUMAR",
            status: "ACTIVE",
          },
        };
      }

      return {
        success: true,
        providerId: "SYSTEM",
        referenceNumber: `REQ-${Date.now()}`,
        resultData: {
          serviceCode,
          status: "SUCCESS",
        },
      };
    } catch (error: any) {
      logger.error(`Error executing ${serviceCode}:`, error);
      return {
        success: false,
        error: error.message || "Gateway execution error",
      };
    }
  }
}

export const serviceEngine = new ServiceEngine();
