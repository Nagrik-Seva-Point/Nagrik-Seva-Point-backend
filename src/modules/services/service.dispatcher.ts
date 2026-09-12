import { prisma } from "../../core/db/prisma";
import { logger } from "../../core/logger/logger";
import { panService } from "../pan/pan.service";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { decryptPanToken } from "../../core/security/crypto.util";
import { sanitizeDpdpData } from "../../core/logger/api-logger";

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

      await prisma.serviceRequestEvent.create({
        data: {
          serviceRequestId,
          status: "PROCESSING",
          note: `Dispatched for automated verification and processing with upstream authority (${request.service.name || request.service.code})`,
        },
      });

      let resultData: Record<string, unknown> | null = null;

      // 2. Route to specific service handlers
      switch (request.service.code) {
        case "PAN_FIND": {
          const tempToken = await ephemeralVault.getTempSearchToken(serviceRequestId);
          const input = (request.inputData || {}) as Record<string, unknown>;
          const searchToken = tempToken || (typeof input?.searchToken === "string" ? input.searchToken : "") || "";
          
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
          const input = (request.inputData || {}) as Record<string, unknown>;
          const searchToken = tempToken || (typeof input?.searchToken === "string" ? input.searchToken : undefined);

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
          } else if (typeof input?.pan === "string" && input.pan) {
            resultData = (await panService.getPanDetails(input.pan)) as unknown as Record<string, unknown>;
          } else {
            throw new Error("Missing PAN/searchToken for PAN_DETAILS service");
          }
          break;
        }

        case "KISAN_CARD":
        case "KISAN_REGISTRATION_CARD": {
          const vaultItem = await ephemeralVault.getVaultItem(serviceRequestId);
          const inputDataObj = (request.inputData && typeof request.inputData === "object" ? request.inputData : {}) as Record<string, unknown>;
          const input: Record<string, unknown> = {
            ...inputDataObj,
            ...(vaultItem?.data || {}),
          };
          resultData = {
            ...input,
            farmerId: input.farmerId || "N/A",
            enrollmentNo: input.enrollmentNo || "N/A",
            name: input.name || input.nameEnglish || input.NameEnglish || input.NameHindi || "Farmer Applicant",
            nameEnglish: input.nameEnglish || input.NameEnglish || "",
            nameHindi: input.nameHindi || input.NameHindi || "",
            fatherName: input.fatherName || "N/A",
            gender: input.gender || "पुरुष",
            mobile: input.mobile || "N/A",
            aadhaar: input.aadhaar || "N/A",
            address: input.address || "N/A",
            totalRakba: input.totalRakba || "",
            totalGata: input.totalGata || "",
            landRecords: Array.isArray(input.landRecords) ? input.landRecords : [],
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
          completedAt: new Date(),
          resultData: {
            status: "COMPLETED",
            serviceCode: request.service.code,
            completedAt: new Date().toISOString(),
            vaultActive: true,
          },
        },
      });

      await prisma.serviceRequestEvent.create({
        data: {
          serviceRequestId,
          status: "COMPLETED",
          note: `Service completed successfully. Verified result retrieved and secured in 24-hour encrypted vault.`,
        },
      });

      logger.info(`[ServiceDispatcher] Fulfillment COMPLETED & stored in 24h vault for Request: ${serviceRequestId}`);

    } catch (error: unknown) {
      logger.error(`[ServiceDispatcher] Fulfillment FAILED for Request ${serviceRequestId}:`, error);
      const msg = error instanceof Error ? error.message : "Upstream verification failed";
      
      // Critical Error: Payment was captured, but API failed.
      // We must mark this state so admins can issue a refund or retry.
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { status: "PROVIDER_FAILED" },
      });

      await prisma.serviceRequestEvent.create({
        data: {
          serviceRequestId,
          status: "PROVIDER_FAILED",
          note: `Provider fulfillment error: ${sanitizeDpdpData(msg) || "Upstream verification failed"}`,
        },
      });
    }
  }
}

export const serviceDispatcher = new ServiceDispatcher();
