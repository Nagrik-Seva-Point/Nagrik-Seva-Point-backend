import type {
  ServiceInput,
  ServiceIntegration,
  ServiceResult,
} from "../integration.interface.ts";
import { AppError } from "../../../core/errors/AppError.ts";
import { logger } from "../../../core/logger/logger.ts";

export class PanAdapter implements ServiceIntegration {
  readonly serviceCode = "PAN_FIND";

  validateInput(inputData: ServiceInput): void {
    const { aadhaar, dob, name } = inputData;

    if (!aadhaar || typeof aadhaar !== "string" || !/^\d{12}$/.test(aadhaar)) {
      throw AppError.badRequest(
        "Invalid Aadhaar number. Must be exactly 12 digits.",
        "INVALID_AADHAAR",
      );
    }

    if (!dob || typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw AppError.badRequest(
        "Invalid DOB format. Must be YYYY-MM-DD.",
        "INVALID_DOB",
      );
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw AppError.badRequest(
        "Invalid name. Must be at least 2 characters.",
        "INVALID_NAME",
      );
    }
  }

  async execute(inputData: ServiceInput): Promise<ServiceResult> {
    logger.info(`Executing PAN Find API integration...`);
    const name = String(inputData.name);

    // In Phase 1, we simulate response delay and mock behavior.
    // In production, we integrate our authorized reseller API here.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (name.toLowerCase().includes("fail")) {
      logger.warn("Simulated provider failure triggered.");
      return {
        success: false,
        error: "PAN not found for the provided details.",
      };
    }

    const mockPan = `ABCDE${Math.floor(1000 + Math.random() * 9000)}F`;
    const refNum = `TXN-${
      Math.random().toString(36).substring(2, 10).toUpperCase()
    }`;

    logger.info(`PAN Find completed successfully. Reference: ${refNum}`);

    return {
      success: true,
      referenceNumber: refNum,
      resultData: {
        pan: mockPan,
        name: name.toUpperCase(),
        matchStatus: "EXACT_MATCH",
      },
    };
  }
}

export const panAdapter = new PanAdapter();
