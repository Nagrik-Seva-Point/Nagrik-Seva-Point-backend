import { requestRepository } from "./request.repository.ts";
import { customerService } from "../customers/customer.service.ts";
import { serviceService } from "../services/service.service.ts";
import { panAdapter } from "../integrations/pan/pan.adapter.ts";
import { AppError } from "../../core/errors/AppError.ts";
import { logger } from "../../core/logger/logger.ts";
import type { CreateRequestInput, QueryRequestInput } from "./request.schema.ts";

export class RequestService {
  async getRequestById(id: string, organizationId: string) {
    const request = await requestRepository.findById(id, organizationId);
    if (!request) {
      throw AppError.notFound(`Service request with ID ${id} not found`);
    }
    return request;
  }

  async queryRequests(organizationId: string, query: QueryRequestInput) {
    return await requestRepository.findMany(organizationId, query);
  }

  async createRequest(organizationId: string, data: CreateRequestInput) {
    // 1. Check idempotency first
    if (data.idempotencyKey) {
      const existing = await requestRepository.findByIdempotencyKey(data.idempotencyKey, organizationId);
      if (existing) {
        logger.info(`Idempotent request matched for key: ${data.idempotencyKey}`);
        return existing;
      }
    }

    // 2. Validate Customer exists
    await customerService.getCustomerById(data.customerId, organizationId);

    // 3. Validate Service is active
    const service = await serviceService.getServiceByCode(data.serviceCode);
    if (!service.isActive) {
      throw AppError.badRequest("Requested service is currently disabled", "SERVICE_DISABLED");
    }

    // 4. Create request in CREATED status
    return await requestRepository.create(organizationId, service.id, data.customerId, data);
  }

  async processRequest(requestId: string, organizationId: string) {
    const request = await this.getRequestById(requestId, organizationId);

    // Ensure we only process requests in CREATED status
    if (request.status !== "CREATED") {
      return request;
    }

    // Direct resolution: For Phase 1, PAN_FIND maps directly to panAdapter
    if (request.service.code !== "PAN_FIND") {
      throw AppError.badRequest(`Unsupported service: ${request.service.code}`, "UNSUPPORTED_SERVICE");
    }

    // 1. Validate inputs
    await panAdapter.validateInput(request.inputData as Record<string, any>);

    try {
      // 2. Transition to PROCESSING
      await requestRepository.updateStatus(requestId, organizationId, "PROCESSING");
      await requestRepository.addEvent(requestId, "PROCESSING");

      // 3. Execute the integration adapter directly
      const result = await panAdapter.execute(request.inputData as Record<string, any>);

      if (result.success) {
        // Transition to SUCCESS
        await requestRepository.updateResult(requestId, organizationId, result.resultData, result.referenceNumber);
        const updatedRequest = await requestRepository.updateStatus(requestId, organizationId, "SUCCESS");
        await requestRepository.addEvent(requestId, "SUCCESS");
        return updatedRequest;
      } else {
        // Business logic failure (e.g. PAN not found)
        await requestRepository.updateResult(requestId, organizationId, { error: result.error });
        const updatedRequest = await requestRepository.updateStatus(requestId, organizationId, "FAILED");
        await requestRepository.addEvent(requestId, "FAILED");
        return updatedRequest;
      }

    } catch (error) {
      // Hard/unhandled adapter or network failure
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Execution error for Request ID ${requestId}:`, error);

      await requestRepository.updateResult(requestId, organizationId, { error: "Internal integration gateway timeout/failure" });
      const updatedRequest = await requestRepository.updateStatus(requestId, organizationId, "FAILED");
      await requestRepository.addEvent(requestId, "FAILED");
      return updatedRequest;
    }
  }
}

export const requestService = new RequestService();
