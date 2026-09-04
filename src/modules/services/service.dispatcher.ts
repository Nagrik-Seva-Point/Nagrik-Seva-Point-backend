import { prisma } from "../../core/db/prisma";
import { logger } from "../../core/logger/logger";
import { panService } from "../pan/pan.service";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { decryptPanToken } from "../../core/security/crypto.util";
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
        case "PAN_FIND": {
          const tempToken = await ephemeralVault.getTempSearchToken(serviceRequestId);
          const input = (request.inputData || {}) as any;
          const searchToken = tempToken || input?.searchToken || "";
          
          if (!searchToken) {
            throw new Error("Missing searchToken in ephemeral vault for PAN_FIND service");
          }

          const decrypted = decryptPanToken(searchToken);
          resultData = {
            pan: decrypted.pan,
            maskedAadhaar: decrypted.aadhaarMasked || "XXXXXXXX1234",
            status: "SUCCESS",
            message: "PAN number retrieved successfully",
          };
          break;
        }

        case "PAN_DETAILS": {
          const tempToken = await ephemeralVault.getTempSearchToken(serviceRequestId);
          const input = (request.inputData || {}) as any;
          const searchToken = tempToken || input?.searchToken;

          if (searchToken && typeof searchToken === "string" && searchToken.includes(".")) {
            const decrypted = decryptPanToken(searchToken);
            resultData = {
              pan: decrypted.pan,
              fullName: decrypted.fullName || "Taxpayer",
              dob: decrypted.dob || "N/A",
              gender: decrypted.gender || "N/A",
              category: decrypted.category || "Individual",
              aadhaarLinked: decrypted.aadhaarLinked ?? true,
              maskedAadhaar: decrypted.aadhaarMasked || "N/A",
              status: "SUCCESS",
            };
          } else if (input?.pan) {
            resultData = await panService.getPanDetails(input.pan);
          } else {
            throw new Error("Missing PAN/searchToken for PAN_DETAILS service");
          }
          break;
        }

        case "KISAN_CARD":
        case "KISAN_REGISTRATION_CARD": {
          const input = (request.inputData || {}) as any;
          resultData = {
            farmerId: input.farmerId || "N/A",
            enrollmentNo: input.enrollmentNo || "N/A",
            name: input.name || input.nameEnglish || input.NameEnglish || "Farmer Applicant",
            mobile: input.mobile || "N/A",
            state: input.state || "BIHAR",
            status: "SUCCESS",
            vaultActive: true,
            completedAt: new Date().toISOString(),
          };
          break;
        }

        default:
          throw new Error(`Unsupported service code: ${request.service.code}`);
      }

      // 3. Store verified result in 24-Hour Encrypted Redis Vault (DPDP Compliant)
      if (resultData) {
        await ephemeralVault.storeVaultItem(serviceRequestId, resultData, 86400);
      }

      // 4. Mark as Completed & Save Operational Status in DB
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { 
          status: "COMPLETED",
          resultData: {
            status: "COMPLETED",
            serviceCode: request.service.code,
            completedAt: new Date().toISOString(),
            vaultActive: true,
          },
        },
      });

      logger.info(`[ServiceDispatcher] Fulfillment COMPLETED & stored in 24h vault for Request: ${serviceRequestId}`);

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
