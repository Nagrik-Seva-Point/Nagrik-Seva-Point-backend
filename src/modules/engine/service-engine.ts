import { mockProviderAdapter } from "../providers/mock/mock.adapter.ts";
import { ezytmAdapter } from "../providers/ezytm/ezytm.adapter.ts";
import type { ProviderAdapter, ProviderResult } from "../providers/provider.interface.ts";
import { AppError } from "../../core/errors/AppError.ts";
import { logger } from "../../core/logger/logger.ts";

export class ServiceEngine {
  private primaryProvider: ProviderAdapter = mockProviderAdapter;
  private fallbackProvider: ProviderAdapter = ezytmAdapter;

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
   * Executes the service workflow through the provider gateway.
   */
  async executeService(
    serviceCode: string,
    inputData: Record<string, unknown>,
  ): Promise<ProviderResult> {
    this.validateServiceInput(serviceCode, inputData);

    logger.info(`ServiceEngine executing service: ${serviceCode}`);

    // 1. Try Primary Provider
    try {
      const result = await this.primaryProvider.execute(serviceCode, inputData);
      if (result.success) {
        return result;
      }

      // If primary fails retryably, try fallback
      if (result.isRetryable) {
        logger.warn(`Primary provider ${this.primaryProvider.name} failed. Attempting fallback...`);
        return await this.fallbackProvider.execute(serviceCode, inputData);
      }

      return result;
    } catch (error) {
      logger.error(`Error executing ${serviceCode} on primary provider:`, error);
      // Attempt fallback on exception
      return await this.fallbackProvider.execute(serviceCode, inputData);
    }
  }
}

export const serviceEngine = new ServiceEngine();
