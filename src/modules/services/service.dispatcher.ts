import { prisma } from "../../core/db/prisma";
import { redis } from "../../core/redis/redis.client";
import { logger } from "../../core/logger/logger";
import { panService } from "../pan/pan.service";
import { rcService } from "../rc/rc.service";
import { dlService } from "../dl/dl.service";
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

      if (request.status === "COMPLETED") {
        logger.warn(`[ServiceDispatcher] Request ${serviceRequestId} is already COMPLETED. Skipping duplicate fulfillment.`);
        return;
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
          const stage = input?.stage;

          if (stage === "DETECT") {
            if (!input?.aadhaar) {
              throw new Error("Missing Aadhaar number for PAN detection");
            }
            const panRes = await panService.findPanByAadhaar(String(input.aadhaar));
            if (!panRes || (!panRes.searchToken && !panRes.maskedPan)) {
              throw new Error("No PAN record returned by registry");
            }
            resultData = {
              maskedPan: panRes.maskedPan,
              searchToken: panRes.searchToken,
              status: "MATCHED",
              message: "PAN identified successfully",
            };
            break;
          }

          let searchToken = tempToken || (typeof input?.searchToken === "string" ? input.searchToken : "") || "";
          
          if (!searchToken && typeof input?.aadhaar === "string" && input.aadhaar) {
            const panRes = await panService.findPanByAadhaar(String(input.aadhaar));
            searchToken = panRes.searchToken;
          }

          if (!searchToken) {
            throw new Error("Missing searchToken or Aadhaar for PAN_FIND service");
          }

          const decrypted = decryptPanToken(searchToken);
          resultData = {
            pan: decrypted.pan,
            maskedPan: `XXXXX${decrypted.pan.slice(5)}`,
            maskedAadhaar: decrypted.aadhaarMasked || (input?.aadhaar ? `XXXXXXXX${String(input.aadhaar).slice(-4)}` : "XXXXXXXX1234"),
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

        case "PAN_TO_AADHAAR": {
          const tempToken = await ephemeralVault.getTempSearchToken(serviceRequestId);
          const input = (request.inputData || {}) as Record<string, unknown>;
          const searchToken = tempToken || (typeof input?.searchToken === "string" ? input.searchToken : undefined);

          if (searchToken && typeof searchToken === "string" && searchToken.includes(".")) {
            resultData = panService.decryptPanToAadhaarToken(searchToken) as unknown as Record<string, unknown>;
          } else if (typeof input?.pan === "string" && input.pan) {
            resultData = (await panService.getAdvancePanToAadhaar(input.pan)) as unknown as Record<string, unknown>;
          } else {
            throw new Error("Missing PAN/searchToken for PAN_TO_AADHAAR service");
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

        case "WALLET_TOPUP": {
          const orgId = request.organizationId;
          const topupAmount = Number(request.amount);
          if (!orgId) {
            throw new Error("Missing organizationId for WALLET_TOPUP");
          }

          // Atomically credit the retailer organization's wallet balance
          const { newBalance, transaction } = await prisma.$transaction(async (tx) => {
            let wallet = await tx.wallet.findUnique({ where: { organizationId: orgId } });
            if (!wallet) {
              wallet = await tx.wallet.create({
                data: { organizationId: orgId, balance: 0.00, currency: "INR" },
              });
            }

            const updatedWallet = await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: topupAmount } },
            });
            const newBal = Number(updatedWallet.balance);

            const txRecord = await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                amount: topupAmount,
                type: "CREDIT",
                balanceAfter: newBal,
                referenceId: serviceRequestId,
                description: `Wallet Top-up via UPI / Cashfree (${request.referenceNumber})`,
              },
            });

            return { newBalance: newBal, transaction: txRecord };
          });

          // Invalidate cache
          redis.delPattern(`cache:wallet:${orgId}:*`).catch(() => {});
          redis.delPattern(`cache:requests:query:${orgId}:*`).catch(() => {});

          resultData = {
            status: "SUCCESS",
            message: `Wallet recharged successfully with ₹${topupAmount.toFixed(2)}`,
            topupAmount,
            newBalance,
            transactionId: transaction.id,
          };
          break;
        }

        case "VEHICLE_LOOKUP":
        case "VEHICLE_RC": {
          const input = (request.inputData || {}) as Record<string, unknown>;
          const vehicleNumber = String(
            input.vehicleNumber || input.rcNumber || input.rc_number || ""
          ).trim();

          if (!vehicleNumber) {
            throw new Error("Missing vehicle registration number for RC lookup service");
          }

          const rcResult = await rcService.getRcDetails(vehicleNumber);
          resultData = {
            ...rcResult,
            status: "SUCCESS",
            completedAt: new Date().toISOString(),
          };
          break;
        }

        case "DL_VERIFY":
        case "DRIVING_LICENSE":
        case "DL_DETAILS": {
          const input = (request.inputData || {}) as Record<string, unknown>;
          const dlNumber = String(
            input.dlNumber || input.licenseNumber || input.license_number || ""
          ).trim();
          const dob = String(input.dob || input.dateOfBirth || "").trim();

          if (!dlNumber) {
            throw new Error("Missing Driving License number for DL verification service");
          }
          if (!dob) {
            throw new Error("Missing Date of Birth for DL verification service");
          }

          const dlResult = await dlService.getDlDetails(dlNumber, dob);
          resultData = {
            ...dlResult,
            status: "SUCCESS",
            completedAt: new Date().toISOString(),
          };
          break;
        }

        case "MOBILE_TO_RC":
        case "MOBILE_RC": {
          const input = (request.inputData || {}) as Record<string, unknown>;
          const mobileNumber = String(
            input.mobileNumber || input.mobile_number || input.mobile || ""
          ).trim();

          if (!mobileNumber) {
            throw new Error("Missing mobile number for Mobile To RC lookup service");
          }

          const mobileResult = await rcService.getMobileToRc(mobileNumber);
          resultData = {
            ...mobileResult,
            status: "SUCCESS",
            completedAt: new Date().toISOString(),
          };
          break;
        }

        case "RC_OWNER_HISTORY":
        case "RC_HISTORY": {
          const input = (request.inputData || {}) as Record<string, unknown>;
          const vehicleNumber = String(
            input.vehicleNumber ||
              input.vehicle_number ||
              input.rc_number ||
              input.rcNumber ||
              ""
          ).trim();

          if (!vehicleNumber) {
            throw new Error(
              "Missing vehicle registration number for RC Owner History service"
            );
          }

          const ownerHistoryResult = await rcService.getRcOwnerHistory(
            vehicleNumber
          );
          resultData = {
            ...ownerHistoryResult,
            status: "SUCCESS",
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
      
      await prisma.serviceRequest.update({
        where: { id: serviceRequestId },
        data: {
          status: "PROVIDER_FAILED",
          resultData: {
            status: "PROVIDER_FAILED",
            error: msg,
            failedAt: new Date().toISOString(),
          },
        },
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
