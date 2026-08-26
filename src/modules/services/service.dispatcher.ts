import { prisma } from "../../core/db/prisma";
import { logger } from "../../core/logger/logger";
import { panService } from "../pan/pan.service";
import { AppError } from "../../core/errors/AppError";

export class ServiceDispatcher {
  
  /**
   * Dispatches a Service Request to the appropriate microservice
   * based on the serviceCode.
   * 
   * This is called asynchronously AFTER a successful payment webhook.
   */
  async fulfillAsync(serviceRequestId: string) {
    try {
      logger.info(`[ServiceDispatcher] Starting fulfillment for Request: ${serviceRequestId}`);
      
      const request = await prisma.serviceRequest.findUnique({
        where: { id: serviceRequestId },
        include: { service: true }
      });

      if (!request) {
        throw new Error("ServiceRequest not found");
      }

      // 1. Mark as processing
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { status: "PROCESSING" },
      });

      let resultData: any = null;

      // 2. Route to specific service handlers
      switch (request.service.code) {
        case "PAN_FIND":
          const input = request.inputData as any;
          if (!input || !input.pan) {
            throw new Error("Missing PAN in inputData for PAN_FIND service");
          }
          resultData = await panService.getPanDetails(input.pan);
          break;

        // Future services go here:
        // case "VOTER_ID_VERIFY":
        //   resultData = await voterService.verify(input.epic);
        //   break;

        default:
          throw new Error(`Unsupported service code: ${request.service.code}`);
      }

      // 3. Mark as Completed & Save Result
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { 
          status: "COMPLETED",
          resultData: resultData, // Store the PDF URL or JSON response
        },
      });

      logger.info(`[ServiceDispatcher] Fulfillment COMPLETED for Request: ${serviceRequestId}`);

    } catch (error: any) {
      logger.error(`[ServiceDispatcher] Fulfillment FAILED for Request ${serviceRequestId}:`, error);
      
      // Critical Error: Payment was captured, but API failed.
      // We must mark this state so admins can issue a refund or retry.
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { status: "PROVIDER_FAILED" },
      });
    }
  }
}

export const serviceDispatcher = new ServiceDispatcher();
