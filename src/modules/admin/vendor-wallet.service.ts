import { prisma } from "../../core/db/prisma";
import { redis } from "../../core/redis/redis.client";
import { brevoMailService } from "../../core/mail/brevo.service";
import { logger } from "../../core/logger/logger";
import { AppError } from "../../core/errors/AppError";
import type { CompanyVendorWalletLog } from "@prisma/client";

export class VendorWalletService {
  private readonly VENDOR_CODE = "PLANAPI";
  private readonly DEFAULT_THRESHOLD = 20.0; // ₹20 threshold

  /**
   * Get or automatically initialize PlanAPI company vendor wallet record
   */
  async getWallet() {
    let wallet = await prisma.companyVendorWallet.findUnique({
      where: { vendorCode: this.VENDOR_CODE },
    });

    if (!wallet) {
      wallet = await prisma.companyVendorWallet.create({
        data: {
          vendorCode: this.VENDOR_CODE,
          vendorName: "PlanAPI / EzyTM Gateway",
          currentBalance: 0.0,
          lowBalanceThreshold: this.DEFAULT_THRESHOLD,
        },
      });
      logger.info(`[VendorWallet] Initialized default company wallet for ${this.VENDOR_CODE}`);
    }

    const recentLogs = await prisma.companyVendorWalletLog.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const balanceNum = Number(wallet.currentBalance);
    const thresholdNum = Number(wallet.lowBalanceThreshold);

    let status: "SAFE" | "LOW_BALANCE" | "CRITICAL" = "SAFE";
    if (balanceNum <= 0) {
      status = "CRITICAL";
    } else if (balanceNum <= thresholdNum) {
      status = "LOW_BALANCE";
    }

    return {
      id: wallet.id,
      vendorCode: wallet.vendorCode,
      vendorName: wallet.vendorName,
      currentBalance: balanceNum,
      lowBalanceThreshold: thresholdNum,
      status,
      lastRechargeAmount: wallet.lastRechargeAmount ? Number(wallet.lastRechargeAmount) : null,
      lastRechargedAt: wallet.lastRechargedAt,
      lastAlertSentAt: wallet.lastAlertSentAt,
      updatedAt: wallet.updatedAt,
      recentLogs: recentLogs.map((log: CompanyVendorWalletLog) => ({
        id: log.id,
        type: log.type,
        amount: Number(log.amount),
        balanceAfter: Number(log.balanceAfter),
        serviceCode: log.serviceCode,
        description: log.description,
        createdAt: log.createdAt,
      })),
    };
  }

  /**
   * Add a top-up recharge to the wallet (e.g. Added ₹500)
   */
  async topupRecharge(amount: number, description?: string) {
    if (amount <= 0) {
      throw AppError.badRequest("Top-up recharge amount must be greater than 0");
    }

    const current = await this.getWallet();
    const newBalance = Number((current.currentBalance + amount).toFixed(2));
    const now = new Date();

    const [updatedWallet, log] = await prisma.$transaction([
      prisma.companyVendorWallet.update({
        where: { vendorCode: this.VENDOR_CODE },
        data: {
          currentBalance: newBalance,
          lastRechargeAmount: amount,
          lastRechargedAt: now,
        },
      }),
      prisma.companyVendorWalletLog.create({
        data: {
          walletId: current.id,
          type: "CREDIT",
          amount: amount,
          balanceAfter: newBalance,
          description: description || `Recharge top-up added (+₹${amount.toFixed(2)})`,
        },
      }),
    ]);

    logger.info(`[VendorWallet] Top-up added: +₹${amount}. New balance: ₹${newBalance}`);

    return {
      currentBalance: Number(updatedWallet.currentBalance),
      addedAmount: amount,
      rechargedAt: now,
      logId: log.id,
    };
  }

  /**
   * Reconcile/Set exact balance matching what admin sees on planapi.in dashboard
   */
  async reconcileExactBalance(exactBalance: number, description?: string) {
    if (exactBalance < 0) {
      throw AppError.badRequest("Balance cannot be negative");
    }

    const current = await this.getWallet();
    const diff = Number((exactBalance - current.currentBalance).toFixed(2));
    const now = new Date();

    const [updatedWallet, log] = await prisma.$transaction([
      prisma.companyVendorWallet.update({
        where: { vendorCode: this.VENDOR_CODE },
        data: {
          currentBalance: exactBalance,
          lastRechargeAmount: diff > 0 ? diff : undefined,
          lastRechargedAt: diff > 0 ? now : undefined,
        },
      }),
      prisma.companyVendorWalletLog.create({
        data: {
          walletId: current.id,
          type: diff >= 0 ? "CREDIT" : "DEBIT",
          amount: Math.abs(diff),
          balanceAfter: exactBalance,
          description:
            description ||
            `Reconciliation sync with PlanAPI dashboard (Diff: ${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`,
        },
      }),
    ]);

    logger.info(
      `[VendorWallet] Reconciled balance: ₹${exactBalance} (Previous: ₹${current.currentBalance}, Diff: ${diff})`
    );

    return {
      currentBalance: Number(updatedWallet.currentBalance),
      difference: diff,
      reconciledAt: now,
      logId: log.id,
    };
  }

  /**
   * Update low balance alert threshold (Default is ₹20.00)
   */
  async updateThreshold(threshold: number) {
    if (threshold <= 0) {
      throw AppError.badRequest("Threshold must be greater than 0");
    }

    const updated = await prisma.companyVendorWallet.update({
      where: { vendorCode: this.VENDOR_CODE },
      data: { lowBalanceThreshold: threshold },
    });

    return {
      vendorCode: updated.vendorCode,
      lowBalanceThreshold: Number(updated.lowBalanceThreshold),
    };
  }

  /**
   * Deduct unit cost when an upstream API lookup executes
   * Checks if balance dips to or below threshold (<= ₹20) and triggers alert
   */
  async deductApiCost(params: {
    serviceCode: string;
    unitCost: number;
    reference?: string;
  }) {
    try {
      const current = await this.getWallet();
      const newBalance = Number((current.currentBalance - params.unitCost).toFixed(2));
      const now = new Date();

      const [updatedWallet] = await prisma.$transaction([
        prisma.companyVendorWallet.update({
          where: { vendorCode: this.VENDOR_CODE },
          data: {
            currentBalance: newBalance,
          },
        }),
        prisma.companyVendorWalletLog.create({
          data: {
            walletId: current.id,
            type: "DEBIT",
            amount: params.unitCost,
            balanceAfter: newBalance,
            serviceCode: params.serviceCode,
            description: `API lookup deduction for ${params.serviceCode} (-₹${params.unitCost.toFixed(2)})${
              params.reference ? ` [${params.reference}]` : ""
            }`,
          },
        }),
      ]);

      logger.info(
        `[VendorWallet] Deducted ₹${params.unitCost} for ${params.serviceCode}. New Balance: ₹${newBalance}`
      );

      // Check if balance has dipped below threshold (default ₹20.00)
      const threshold = Number(updatedWallet.lowBalanceThreshold);
      if (newBalance <= threshold) {
        await this.checkAndTriggerThresholdAlert({
          serviceCode: params.serviceCode,
          currentBalance: newBalance,
          threshold,
        });
      }

      return {
        previousBalance: current.currentBalance,
        newBalance,
        deducted: params.unitCost,
      };
    } catch (err) {
      logger.error(`[VendorWallet] Failed to deduct API cost:`, err);
      // Non-blocking: Do not fail the user's live lookup if ledger logging fails
      return null;
    }
  }

  /**
   * Trigger Brevo Email Alert to Admin when balance <= ₹20
   * 15-minute throttle lock via Redis to avoid flooding on rapid lookups
   */
  private async checkAndTriggerThresholdAlert(params: {
    serviceCode: string;
    currentBalance: number;
    threshold: number;
  }) {
    const lockKey = `alert:vendor_wallet_threshold_lock:${this.VENDOR_CODE}`;
    try {
      const isLocked = await redis.get(lockKey);
      if (isLocked) {
        logger.info(
          `[VendorWalletAlert] Threshold alert throttled for ${this.VENDOR_CODE}. Current: ₹${params.currentBalance}. Skipping duplicate.`
        );
        return;
      }

      // 15-minute lock (900 seconds)
      await redis.set(lockKey, "1", 900);

      // Update lastAlertSentAt in DB
      await prisma.companyVendorWallet.update({
        where: { vendorCode: this.VENDOR_CODE },
        data: { lastAlertSentAt: new Date() },
      });

      logger.warn(
        `[VendorWalletAlert] Balance is at or below threshold! Current: ₹${params.currentBalance} <= ₹${params.threshold}. Dispatching Admin alert email.`
      );

      await brevoMailService.sendLowBalanceAdminAlert({
        serviceCode: params.serviceCode,
        serviceName: `PlanAPI Gateway Ledger Balance (₹${params.currentBalance.toFixed(2)})`,
        vendorError: `Ledger balance dipped to ₹${params.currentBalance.toFixed(
          2
        )} (Threshold: ₹${params.threshold.toFixed(2)}). Immediate recharge required to prevent downtime.`,
        rechargeUrl: "https://planapi.in",
      });
    } catch (err) {
      logger.error(`[VendorWalletAlert] Failed to trigger threshold alert:`, err);
    }
  }
}

export const vendorWalletService = new VendorWalletService();
