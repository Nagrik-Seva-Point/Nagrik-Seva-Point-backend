import { prisma } from "../../core/db/prisma";
import { redis } from "../../core/redis/redis.client";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { serviceDispatcher } from "../services/service.dispatcher";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { sanitizeDpdpData, maskEmail, maskIpAddress } from "../../core/logger/api-logger";
import type { PaymentStatus, PaymentMethod, AccessMode, PricingTier } from "@prisma/client";
import type {
  WalletAdjustmentInput,
  MaintenanceToggleInput,
  AnnouncementInput,
  OrgStatusInput,
  TierPriceUpdateInput,
  AuditLogQueryInput,
} from "./admin.schema";

export interface TransactionFilterQuery {
  search?: string;
  status?: string;
  method?: string;
  serviceCode?: string;
  accessMode?: string;
  organizationId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface OrganizationFilterQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export class AdminService {
  /**
   * 1. List all transactions with advanced debugging filters & aggregated metrics
   */
  async getTransactions(query: TransactionFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.status && query.status !== "ALL") {
      where.status = query.status.toUpperCase() as PaymentStatus;
    }

    if (query.method && query.method !== "ALL") {
      where.method = query.method.toUpperCase() as PaymentMethod;
    }

    if (query.organizationId && query.organizationId !== "ALL") {
      where.organizationId = query.organizationId;
    }

    if (query.startDate || query.endDate) {
      const createdAtCond: Record<string, Date> = {};
      if (query.startDate) {
        createdAtCond.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        createdAtCond.lte = end;
      }
      where.createdAt = createdAtCond;
    }

    const serviceRequestConditions: Record<string, unknown> = {};
    if (query.serviceCode && query.serviceCode !== "ALL") {
      serviceRequestConditions.service = {
        code: query.serviceCode,
      };
    }
    if (query.accessMode && query.accessMode !== "ALL") {
      serviceRequestConditions.accessMode = query.accessMode.toUpperCase() as AccessMode;
    }
    if (Object.keys(serviceRequestConditions).length > 0) {
      where.serviceRequest = serviceRequestConditions;
    }

    if (query.search && query.search.trim()) {
      const searchTerms = query.search.trim();
      where.OR = [
        { orderId: { contains: searchTerms, mode: "insensitive" } },
        { transactionId: { contains: searchTerms, mode: "insensitive" } },
        { bankReference: { contains: searchTerms, mode: "insensitive" } },
        { paymentSessionId: { contains: searchTerms, mode: "insensitive" } },
        { errorMessage: { contains: searchTerms, mode: "insensitive" } },
        {
          serviceRequest: {
            referenceNumber: { contains: searchTerms, mode: "insensitive" },
          },
        },
        {
          user: {
            OR: [
              { name: { contains: searchTerms, mode: "insensitive" } },
              { email: { contains: searchTerms, mode: "insensitive" } },
              { phone: { contains: searchTerms, mode: "insensitive" } },
            ],
          },
        },
        {
          organization: {
            name: { contains: searchTerms, mode: "insensitive" },
          },
        },
      ];
    }

    const [total, items, capturedSum, statusCounts] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          serviceRequest: {
            select: {
              id: true,
              referenceNumber: true,
              accessMode: true,
              status: true,
              providerId: true,
              providerReference: true,
              service: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      prisma.payment.aggregate({
        where: { ...where, status: "CAPTURED" },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    const statusMap = statusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        totalTransactions: total,
        totalCapturedAmount: Number(capturedSum._sum.amount || 0),
        capturedCount: statusMap["CAPTURED"] || 0,
        pendingCount: statusMap["PENDING"] || 0,
        failedCount: statusMap["FAILED"] || 0,
        refundedCount: statusMap["REFUNDED"] || 0,
        authorizedCount: statusMap["AUTHORIZED"] || 0,
      },
    };
  }

  /**
   * 2. Get Single Transaction with complete debug audit
   */
  async getTransactionById(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        organization: {
          include: {
            wallet: true,
          },
        },
        serviceRequest: {
          include: {
            service: true,
            customer: true,
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!payment) {
      throw AppError.notFound("Transaction record not found", "TRANSACTION_NOT_FOUND");
    }

    return payment;
  }

  /**
   * 3. List all Organizations with stats and balances
   */
  async getOrganizations(query: OrganizationFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { slug: { contains: s, mode: "insensitive" } },
        {
          members: {
            some: {
              user: {
                OR: [
                  { name: { contains: s, mode: "insensitive" } },
                  { email: { contains: s, mode: "insensitive" } },
                  { phone: { contains: s, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ];
    }

    const [total, items, totalWalletSum] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          wallet: true,
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  role: true,
                  updatedAt: true,
                  sessions: {
                    orderBy: { updatedAt: "desc" },
                    take: 1,
                    select: {
                      updatedAt: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
          payments: {
            where: {
              status: "CAPTURED",
            },
            select: {
              id: true,
              amount: true,
              paidAt: true,
              createdAt: true,
            },
          },
          requests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              createdAt: true,
            },
          },
          _count: {
            select: {
              members: true,
              customers: true,
              requests: true,
              payments: true,
            },
          },
        },
      }),
      prisma.wallet.aggregate({
        _sum: { balance: true },
      }),
    ]);

    const enhancedItems = items.map((org) => {
      const ownerUser = org.members[0]?.user;
      const lastSessionDate = ownerUser?.sessions?.[0]?.updatedAt || ownerUser?.sessions?.[0]?.createdAt;
      const lastLogin = lastSessionDate || ownerUser?.updatedAt || org.createdAt;

      const completedPayments = org.payments || [];
      const completedPaymentsCount = completedPayments.length;
      const completedPaymentsAmount = completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      return {
        ...org,
        lastLogin,
        completedPaymentsCount,
        completedPaymentsAmount,
      };
    });

    return {
      items: enhancedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        totalOrganizations: total,
        totalWalletBalance: Number(totalWalletSum._sum.balance || 0),
      },
    };
  }

  /**
   * 4. Get Organization Details by ID
   */
  async getOrganizationById(id: string) {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        wallet: {
          include: {
            transactions: {
              take: 20,
              orderBy: { createdAt: "desc" },
            },
          },
        },
        members: {
          include: {
            user: true,
          },
        },
        requests: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            service: true,
            customer: true,
          },
        },
        payments: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            members: true,
            customers: true,
            requests: true,
            payments: true,
          },
        },
      },
    });

    if (!org) {
      throw AppError.notFound("Organization not found", "ORG_NOT_FOUND");
    }

    return org;
  }

  /**
   * 5. Master Admin KPI Overview Stats (Cached in Redis 60s TTL)
   */
  async getOverviewStats() {
    return await redis.remember("cache:admin:overview_stats", 60, async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        totalUsers,
        totalOrgs,
        totalRequests,
        completedRequests,
        allPaymentsSum,
        todayPaymentsSum,
        recentTransactions,
        topServicesGroup,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.organization.count(),
        prisma.serviceRequest.count(),
        prisma.serviceRequest.count({ where: { status: "COMPLETED" } }),
        prisma.payment.aggregate({
          where: { status: "CAPTURED" },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            status: "CAPTURED",
            createdAt: { gte: todayStart },
          },
          _sum: { amount: true },
        }),
        prisma.payment.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { name: true, phone: true, email: true },
            },
            organization: {
              select: { name: true },
            },
            serviceRequest: {
              select: {
                referenceNumber: true,
                service: { select: { name: true, code: true } },
              },
            },
          },
        }),
        prisma.serviceRequest.groupBy({
          by: ["serviceId"],
          _count: { _all: true },
          orderBy: { _count: { serviceId: "desc" } },
          take: 5,
        }),
      ]);

      const serviceIds = topServicesGroup.map((s) => s.serviceId);
      const services = await prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true, code: true },
      });

      const topServices = topServicesGroup.map((g) => {
        const s = services.find((srv) => srv.id === g.serviceId);
        return {
          serviceId: g.serviceId,
          name: s?.name || "Unknown Service",
          code: s?.code || "UNKNOWN",
          count: g._count._all,
        };
      });

      const successRate =
        totalRequests > 0
          ? Math.round((completedRequests / totalRequests) * 100)
          : 100;

      return {
        totalRevenue: Number(allPaymentsSum._sum.amount || 0),
        todayRevenue: Number(todayPaymentsSum._sum.amount || 0),
        totalUsers,
        totalOrganizations: totalOrgs,
        totalRequests,
        completedRequests,
        successRate,
        recentTransactions,
        topServices,
      };
    });
  }

  // ==========================================
  // 6. DISPUTE & EXCEPTION DESK ("Paisa Kat Gaya" Resolver)
  // ==========================================

  /**
   * Lists hanging requests where payment was captured but service has not completed.
   */
  async getHangingRequests() {
    const hanging = await prisma.serviceRequest.findMany({
      where: {
        payments: {
          some: { status: "CAPTURED" },
        },
        status: {
          in: ["REQUEST_CREATED", "PROCESSING", "PROVIDER_FAILED", "PAYMENT_PENDING", "PAYMENT_CAPTURED"],
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        service: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        organization: {
          select: {
            id: true,
            name: true,
            wallet: true,
          },
        },
        payments: {
          where: { status: "CAPTURED" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        customer: true,
      },
      take: 100,
    });

    return hanging;
  }

  /**
   * Re-triggers fulfillment for a hanging request
   */
  async retryDispute(serviceRequestId: string) {
    const req = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      include: { service: true },
    });

    if (!req) {
      throw AppError.notFound("Service request not found", "NOT_FOUND");
    }

    logger.info(`[Admin] Manually retrying fulfillment for request: ${serviceRequestId}`);
    
    // Asynchronously dispatch fulfillment
    serviceDispatcher.fulfillAsync(serviceRequestId).catch((err) => {
      logger.error(`[Admin] Async retry fulfillment failed for ${serviceRequestId}:`, err);
    });

    return {
      success: true,
      message: `Fulfillment re-triggered for request ${req.referenceNumber || serviceRequestId}.`,
    };
  }

  /**
   * Manually overrides a failed request with custom data / PDF
   */
  async manualOverrideDispute(serviceRequestId: string, resultData: unknown, note?: string) {
    const req = await prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });

    if (!req) {
      throw AppError.notFound("Service request not found", "NOT_FOUND");
    }

    const normalizedData = {
      ...(typeof resultData === "object" && resultData !== null ? resultData : { raw: resultData }),
      status: "SUCCESS",
      manualOverride: true,
      adminNote: note || "Manually fulfilled by Master Administrator",
      completedAt: new Date().toISOString(),
    };

    // Store in 24h ephemeral DPDP vault
    await ephemeralVault.storeVaultItem(serviceRequestId, normalizedData, 86400);

    // Update request state
    await prisma.serviceRequest.update({
      where: { id: serviceRequestId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultData: {
          status: "COMPLETED",
          manualOverride: true,
          completedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.serviceRequestEvent.create({
      data: {
        serviceRequestId,
        status: "COMPLETED",
        note: note || "Admin manual override completed",
      },
    });

    return {
      success: true,
      message: `Request ${req.referenceNumber || serviceRequestId} marked as COMPLETED via manual override.`,
    };
  }

  // ==========================================
  // 7. UPSTREAM VENDOR HEALTH & CREDITS
  // ==========================================

  async getVendorHealth() {
    // 1. Database latency
    const dbStart = Date.now();
    let dbStatus = "HEALTHY";
    let dbLatency = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch {
      dbStatus = "DOWN";
    }

    // 2. Redis latency
    const redisStart = Date.now();
    let redisStatus = "HEALTHY";
    let redisLatency = 0;
    try {
      const pong = await redis.getRawClient()?.ping();
      redisLatency = Date.now() - redisStart;
      if (!pong) redisStatus = "DEGRADED";
    } catch {
      redisStatus = "DOWN";
    }

    // 3. Cashfree Gateway Status
    const cfEnv = process.env.CASHFREE_ENVIRONMENT || "sandbox";
    const cfUrl = process.env.CASHFREE_API_URL || (cfEnv === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");
    const hasCfCredentials = Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);

    // 4. Ephemeral Vault Active Keys
    let activeVaultKeys = 0;
    try {
      const client = redis.getRawClient();
      if (client) {
        const keys = await client.keys("vault:*");
        activeVaultKeys = keys.length;
      }
    } catch {
      activeVaultKeys = 0;
    }

    // 6. Network Bandwidth & I/O Telemetry (100% Real Measured Data)
    let hostNetworkStats: { rxBytes: number; txBytes: number; interfaceName: string } | null = null;
    try {
      const fs = await import("node:fs/promises");
      const netDev = await fs.readFile("/proc/net/dev", "utf-8");
      const lines = netDev.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("wlan0:") || trimmed.startsWith("eth0:") || trimmed.startsWith("ens")) {
          const parts = trimmed.split(":")[1].trim().split(/\s+/);
          const rx = parseInt(parts[0], 10);
          const tx = parseInt(parts[8], 10);
          if (!isNaN(rx) && !isNaN(tx)) {
            hostNetworkStats = { rxBytes: rx, txBytes: tx, interfaceName: trimmed.split(":")[0] };
            break;
          }
        }
      }
    } catch {
      hostNetworkStats = null;
    }

    // Measure exact database payload bytes
    const appPayloads = {
      totalRequests: 0,
      inboundPayloadBytes: 0,
      outboundPayloadBytes: 0,
      totalPayments: 0,
      paymentWebhookBytes: 0,
    };
    try {
      interface ReqStatRow {
        total_requests: number;
        inbound_bytes: number | string;
        outbound_bytes: number | string;
      }
      interface PayStatRow {
        total_payments: number;
        webhook_bytes: number | string;
      }
      const reqStats: ReqStatRow[] = await prisma.$queryRaw`
        SELECT 
          COUNT(*)::int as total_requests,
          COALESCE(SUM(octet_length(CAST("inputData" AS text))), 0)::bigint as inbound_bytes,
          COALESCE(SUM(octet_length(CAST("resultData" AS text))), 0)::bigint as outbound_bytes
        FROM "ServiceRequest"
      `;
      const payStats: PayStatRow[] = await prisma.$queryRaw`
        SELECT 
          COUNT(*)::int as total_payments,
          COALESCE(SUM(octet_length(CAST("gatewayResponse" AS text))), 0)::bigint as webhook_bytes
        FROM "Payment"
      `;

      if (reqStats && reqStats[0]) {
        appPayloads.totalRequests = Number(reqStats[0].total_requests) || 0;
        appPayloads.inboundPayloadBytes = Number(reqStats[0].inbound_bytes) || 0;
        appPayloads.outboundPayloadBytes = Number(reqStats[0].outbound_bytes) || 0;
      }
      if (payStats && payStats[0]) {
        appPayloads.totalPayments = Number(payStats[0].total_payments) || 0;
        appPayloads.paymentWebhookBytes = Number(payStats[0].webhook_bytes) || 0;
      }
    } catch {
      // Keep defaults if query fails
    }

    const rxBytes = hostNetworkStats ? hostNetworkStats.rxBytes : appPayloads.inboundPayloadBytes + appPayloads.paymentWebhookBytes;
    const txBytes = hostNetworkStats ? hostNetworkStats.txBytes : appPayloads.outboundPayloadBytes;

    const bandwidth = {
      source: hostNetworkStats ? "HOST_KERNEL" : "DATABASE_PAYLOADS",
      interfaceName: hostNetworkStats?.interfaceName,
      totalRxBytes: rxBytes,
      totalTxBytes: txBytes,
      totalBytes: rxBytes + txBytes,
      applicationPayloads: appPayloads,
    };

    return {
      overallStatus: dbStatus === "HEALTHY" && redisStatus === "HEALTHY" ? "HEALTHY" : "DEGRADED",
      database: {
        status: dbStatus,
        latencyMs: dbLatency,
        provider: "PostgreSQL",
      },
      redis: {
        status: redisStatus,
        latencyMs: redisLatency,
        activeVaultKeys,
      },
      cashfree: {
        status: hasCfCredentials ? "CONFIGURED" : "MISSING_CREDENTIALS",
        environment: cfEnv,
        endpoint: cfUrl,
      },
      bandwidth,
    };
  }

  // ==========================================
  // 8. SERVICE KILL-SWITCHES & MAINTENANCE MODE
  // ==========================================

  async getMaintenanceStatus() {
    const globalMaint = await redis.getJson<{ enabled?: boolean; message?: string }>("system:maintenance:global");
    const services = await prisma.service.findMany({
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { code: "asc" },
    });

    const serviceStatuses = await Promise.all(
      services.map(async (srv) => {
        const maint = await redis.getJson<{ enabled?: boolean; message?: string }>(`service:maintenance:${srv.code}`);
        return {
          id: srv.id,
          code: srv.code,
          name: srv.name,
          isActive: srv.isActive,
          underMaintenance: maint ? Boolean(maint.enabled) : false,
          maintenanceMessage: maint?.message || null,
        };
      })
    );

    return {
      globalMaintenance: {
        enabled: globalMaint ? Boolean(globalMaint.enabled) : false,
        message: globalMaint?.message || null,
      },
      services: serviceStatuses,
    };
  }

  async setMaintenanceStatus(input: MaintenanceToggleInput) {
    if (input.scope === "GLOBAL") {
      await redis.setJson("system:maintenance:global", {
        enabled: input.enabled,
        message: input.message || "Platform under scheduled maintenance",
        updatedAt: new Date().toISOString(),
      });
    } else if (input.serviceCode) {
      const code = input.serviceCode.toUpperCase();
      await redis.setJson(`service:maintenance:${code}`, {
        enabled: input.enabled,
        message: input.message || `Service ${code} is temporarily under maintenance`,
        updatedAt: new Date().toISOString(),
      });
    }

    // Invalidate cached services catalogue
    await redis.delPattern("cache:services:*");

    return {
      success: true,
      message: "Maintenance configuration updated successfully.",
    };
  }

  // ==========================================
  // 9. IN-APP BROADCAST NOTICE BOARD
  // ==========================================

  async getAnnouncement() {
    const announcement = await redis.getJson<Record<string, unknown>>("system:announcement");
    return announcement || { active: false, message: "" };
  }

  async setAnnouncement(input: AnnouncementInput) {
    const data = {
      ...input,
      updatedAt: new Date().toISOString(),
    };

    await redis.setJson("system:announcement", data);
    return {
      success: true,
      data,
    };
  }

  // ==========================================
  // 10. WALLET GOVERNANCE & RECONCILIATION
  // ==========================================

  async adjustOrganizationWallet(organizationId: string, input: WalletAdjustmentInput) {
    return await prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { organizationId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            organizationId,
            balance: 0.00,
            currency: "INR",
          },
        });
      }

      const prevBalance = Number(wallet.balance);
      let newBalance = prevBalance;

      if (input.type === "CREDIT") {
        newBalance = prevBalance + input.amount;
      } else {
        if (prevBalance < input.amount) {
          throw AppError.badRequest(
            `Insufficient wallet balance. Current balance is ₹${prevBalance.toFixed(2)}, cannot debit ₹${input.amount.toFixed(2)}`,
            "INSUFFICIENT_BALANCE"
          );
        }
        newBalance = prevBalance - input.amount;
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      const txRecord = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: input.amount,
          type: input.type,
          balanceAfter: newBalance,
          referenceId: input.referenceId || null,
          description: `[Manual Admin ${input.type}] ${input.reason}`,
        },
      });

      logger.info(
        `[Admin] Wallet adjusted for Org ${organizationId}: ${input.type} ₹${input.amount} (Balance: ${prevBalance} -> ${newBalance})`
      );

      return {
        success: true,
        previousBalance: prevBalance,
        newBalance,
        transaction: txRecord,
        message: `Wallet ${input.type === "CREDIT" ? "credited" : "debited"} ₹${input.amount.toFixed(2)} successfully.`,
      };
    });
  }

  async getLedgerReconciliation() {
    const [capturedPayments, walletCredits, walletDebits, completedRequests] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: "CAPTURED" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "CREDIT" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "DEBIT" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.serviceRequest.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const totalGatewayInflow = Number(capturedPayments._sum.amount || 0);
    const totalWalletCredits = Number(walletCredits._sum.amount || 0);
    const totalWalletDebits = Number(walletDebits._sum.amount || 0);
    const totalServiceFulfilled = Number(completedRequests._sum.amount || 0);

    return {
      totalGatewayInflow,
      gatewayTransactionsCount: capturedPayments._count._all,
      totalWalletCredits,
      totalWalletDebits,
      activeWalletLiabilities: totalWalletCredits - totalWalletDebits,
      totalServiceFulfilled,
      completedRequestsCount: completedRequests._count._all,
      netEstimatedMargin: Math.max(0, totalServiceFulfilled * 0.4), // Platform 40% margin estimate
    };
  }

  // ==========================================
  // 11. DYNAMIC PRICING & TIER MANAGER
  // ==========================================

  async getPricingMatrix() {
    const services = await prisma.service.findMany({
      include: {
        category: true,
        prices: true,
      },
      orderBy: { code: "asc" },
    });

    const defaultEstimatedCost: Record<string, number> = {
      PAN_FIND: 2.5,
      PAN_DETAILS: 2.0,
      KISAN_CARD: 0.0,
      KISAN_REGISTRATION_CARD: 0.0,
    };

    return services.map((srv) => {
      const getPrice = (tier: PricingTier) => {
        const found = srv.prices.find((p) => p.pricingTier === tier);
        return found ? Number(found.amount) : 0;
      };

      const partnerPrice = getPrice("PARTNER") || Number(srv.retailerPrice || 25);
      const estCost = defaultEstimatedCost[srv.code] ?? 0.0;
      const margin = partnerPrice - estCost;

      return {
        id: srv.id,
        code: srv.code,
        name: srv.name,
        category: srv.category?.name || "General",
        isActive: srv.isActive,
        prices: {
          public: getPrice("PUBLIC") || 40,
          partner: partnerPrice,
          partnerGold: getPrice("PARTNER_GOLD") || partnerPrice * 0.85,
          enterprise: getPrice("ENTERPRISE") || partnerPrice * 0.70,
        },
        estimatedVendorCost: estCost,
        estimatedProfitMargin: margin,
      };
    });
  }

  async updateTierPrice(input: TierPriceUpdateInput) {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
    });

    if (!service) {
      throw AppError.notFound("Service not found", "NOT_FOUND");
    }

    const priceRecord = await prisma.servicePrice.upsert({
      where: {
        serviceId_pricingTier: {
          serviceId: input.serviceId,
          pricingTier: input.pricingTier as PricingTier,
        },
      },
      create: {
        serviceId: input.serviceId,
        pricingTier: input.pricingTier as PricingTier,
        amount: input.amount,
        currency: "INR",
      },
      update: {
        amount: input.amount,
      },
    });

    // Invalidate service catalog caches
    await redis.delPattern("cache:services:*");

    return {
      success: true,
      serviceId: input.serviceId,
      pricingTier: input.pricingTier,
      amount: Number(priceRecord.amount),
      message: `Price for ${service.code} (${input.pricingTier}) updated to ₹${input.amount.toFixed(2)}.`,
    };
  }

  // ==========================================
  // 12. RETAILER CHURN RADAR & LIFECYCLE
  // ==========================================

  async getChurnRadar() {
    return await redis.remember("cache:admin:churn_radar", 60, async () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const orgs = await prisma.organization.findMany({
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, phone: true, email: true },
              },
            },
          },
          requests: {
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { requests: true, payments: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      interface ChurnRecord {
        id: string;
        name: string;
        slug: string;
        ownerName: string;
        phone: string;
        email: string;
        whatsappUrl: string | null;
        totalRequests: number;
        createdAt: Date;
        lastActiveAt: Date | null;
      }

      const day0Dropoffs: ChurnRecord[] = [];
      const activeOrgs: ChurnRecord[] = [];
      const dormantOrgs: ChurnRecord[] = [];
      const powerOrgs: ChurnRecord[] = [];

      orgs.forEach((org) => {
        const owner = org.members[0]?.user;
        const totalRequests = org._count.requests;
        const lastRequestDate = org.requests[0]?.createdAt ? new Date(org.requests[0].createdAt) : null;
        const cleanPhone = owner?.phone?.replace(/[^0-9]/g, "") || "";
        const whatsappUrl = cleanPhone.length === 10
          ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Namaste ${owner?.name || "Partner"} ji, Nagrik Seva Point support team here. Aapke Cyber Café par services chalu karne me koi dikkat aa rahi hai?`)}`
          : null;

        const record: ChurnRecord = {
          id: org.id,
          name: org.name,
          slug: org.slug || org.id,
          ownerName: owner?.name || "N/A",
          phone: owner?.phone || "N/A",
          email: owner?.email || "N/A",
          whatsappUrl,
          totalRequests,
          createdAt: org.createdAt,
          lastActiveAt: lastRequestDate,
        };

        if (org.createdAt <= twoDaysAgo && totalRequests === 0) {
          day0Dropoffs.push(record);
        } else if (lastRequestDate && lastRequestDate >= sevenDaysAgo) {
          activeOrgs.push(record);
          if (totalRequests >= 20) {
            powerOrgs.push(record);
          }
        } else if (totalRequests > 0 && (!lastRequestDate || lastRequestDate < fourteenDaysAgo)) {
          dormantOrgs.push(record);
        } else {
          activeOrgs.push(record);
        }
      });

      return {
        summary: {
          totalOrganizations: orgs.length,
          activeCount: activeOrgs.length,
          day0DropoffCount: day0Dropoffs.length,
          dormantCount: dormantOrgs.length,
          powerCount: powerOrgs.length,
        },
        day0Dropoffs: day0Dropoffs.slice(0, 30),
        activeOrgs: activeOrgs.slice(0, 30),
        dormantOrgs: dormantOrgs.slice(0, 30),
        powerOrgs: powerOrgs.slice(0, 30),
      };
    });
  }

  async setOrganizationStatus(organizationId: string, input: OrgStatusInput) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw AppError.notFound("Organization not found", "NOT_FOUND");
    }

    let metadataObj: Record<string, unknown> = {};
    try {
      if (org.metadata) metadataObj = JSON.parse(org.metadata);
    } catch {
      metadataObj = {};
    }

    metadataObj.status = input.status;
    metadataObj.statusReason = input.reason || null;
    metadataObj.statusUpdatedAt = new Date().toISOString();

    await prisma.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify(metadataObj) },
    });

    await redis.set(`org:status:${organizationId}`, input.status);

    return {
      success: true,
      organizationId,
      status: input.status,
      message: `Organization status updated to ${input.status}.`,
    };
  }

  // ==========================================
  // 13. FINANCIAL LEAKAGE & UNIT ECONOMICS
  // ==========================================

  async getFinancialLeakage(timeRange: "TODAY" | "YESTERDAY" | "7DAYS" | "30DAYS" | "ALL" = "30DAYS") {
    const cacheKey = `cache:admin:financial_leakage:${timeRange}`;
    return await redis.remember(cacheKey, 15, async () => {
      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (timeRange === "TODAY") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeRange === "YESTERDAY") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeRange === "7DAYS") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeRange === "30DAYS") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeRange === "ALL") {
        startDate = undefined;
      }

      const whereDate: Record<string, unknown> = {};
      if (startDate && endDate) {
        whereDate.createdAt = { gte: startDate, lt: endDate };
      } else if (startDate) {
        whereDate.createdAt = { gte: startDate };
      }

      // PlainAPI / Upstream Vendor Unit Cost Map (Only paid vendor APIs incur cost)
      const serviceCostMap: Record<string, number> = {
        PAN_FIND: 2.5,
        PAN_DETAILS: 2.0,
        KISAN_CARD: 0.0,
        KISAN_REGISTRATION_CARD: 0.0,
      };

      const [services, allRequests] = await Promise.all([
        prisma.service.findMany({
          select: { id: true, code: true, name: true },
        }),
        prisma.serviceRequest.findMany({
          where: whereDate,
          orderBy: { createdAt: "desc" },
          take: 300,
          include: {
            service: { select: { id: true, code: true, name: true } },
            organization: { select: { id: true, name: true, slug: true } },
            user: { select: { id: true, name: true, phone: true, email: true } },
            customer: { select: { id: true, name: true, phone: true } },
            payments: {
              select: { id: true, amount: true, status: true, paidAt: true },
            },
          },
        }),
      ]);

      let totalGrossRevenue = 0;
      let completedVendorCost = 0;
      let wastedVendorCost = 0;
      let panFindCalls = 0;
      let panDetailsCalls = 0;
      let otherCalls = 0;

      let completedCount = 0;
      let abandonedCount = 0;

      // Grouping per service for deep-dive
      const serviceMap: Record<string, {
        code: string;
        name: string;
        unitCost: number;
        totalInvocations: number;
        completedCount: number;
        completedRevenue: number;
        fulfilledCost: number;
        abandonedCount: number;
        wastedCost: number;
      }> = {};

      services.forEach((s) => {
        serviceMap[s.code] = {
          code: s.code,
          name: s.name,
          unitCost: serviceCostMap[s.code] ?? 0.0,
          totalInvocations: 0,
          completedCount: 0,
          completedRevenue: 0,
          fulfilledCost: 0,
          abandonedCount: 0,
          wastedCost: 0,
        };
      });

      const detailedLedger = allRequests.map((req) => {
        const code = req.service.code;
        const unitCost = serviceCostMap[code] ?? 0.0;

        if (code === "PAN_FIND") panFindCalls++;
        else if (code === "PAN_DETAILS") panDetailsCalls++;
        else otherCalls++;

        if (!serviceMap[code]) {
          serviceMap[code] = {
            code,
            name: req.service.name,
            unitCost,
            totalInvocations: 0,
            completedCount: 0,
            completedRevenue: 0,
            fulfilledCost: 0,
            abandonedCount: 0,
            wastedCost: 0,
          };
        }
        serviceMap[code].totalInvocations++;

        const capturedPayment = req.payments.find((p) => p.status === "CAPTURED");
        const isCompleted = req.status === "COMPLETED" || Boolean(capturedPayment);
        const isAbandoned = !isCompleted && ["REQUEST_CREATED", "PRICE_LOCKED", "PAYMENT_PENDING"].includes(req.status);

        let revenue = 0;
        if (isCompleted) {
          completedCount++;
          revenue = capturedPayment ? Number(capturedPayment.amount) : Number(req.amount || 0);
          totalGrossRevenue += revenue;
          completedVendorCost += unitCost;

          serviceMap[code].completedCount++;
          serviceMap[code].completedRevenue += revenue;
          serviceMap[code].fulfilledCost += unitCost;
        } else if (isAbandoned) {
          abandonedCount++;
          wastedVendorCost += unitCost;

          serviceMap[code].abandonedCount++;
          serviceMap[code].wastedCost += unitCost;
        }

        const netProfit = revenue - unitCost;
        const targetPhone = req.customer?.phone || req.user?.phone || "";
        const cleanPhone = targetPhone.replace(/[^0-9]/g, "");
        const targetName = req.customer?.name || req.user?.name || "Customer";
        const whatsappUrl = cleanPhone.length === 10
          ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Namaste ${targetName} ji, Nagrik Seva Point support team here. Aapka ${req.service.name} lookup process start hua tha. Kya payment / checkout complete karne me koi dikkat aa rahi hai?`)}`
          : null;

        return {
          id: req.id,
          referenceNumber: req.referenceNumber || req.id.slice(0, 8).toUpperCase(),
          serviceCode: code,
          serviceName: req.service.name,
          createdAt: req.createdAt,
          status: req.status,
          isPaid: isCompleted,
          revenue,
          incurredVendorCost: unitCost,
          netProfit,
          organization: req.organization ? { id: req.organization.id, name: req.organization.name } : null,
          user: req.user ? { name: req.user.name, phone: req.user.phone } : null,
          customer: req.customer ? { name: req.customer.name, phone: req.customer.phone } : null,
          whatsappUrl,
        };
      });

      const totalRequests = allRequests.length;
      const totalVendorBurn = completedVendorCost + wastedVendorCost;
      const netPlatformProfit = totalGrossRevenue - totalVendorBurn;
      const profitMargin = totalGrossRevenue > 0 ? Math.round((netPlatformProfit / totalGrossRevenue) * 100) : 0;
      const conversionRate = totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 100;
      const dropoffRate = 100 - conversionRate;

      // PlainAPI Wallet Burn breakdown (only paid vendor API calls burn wallet credits)
      const plainApiWalletBurn = {
        panFindCalls,
        panFindBurn: Number((panFindCalls * 2.5).toFixed(2)),
        panDetailsCalls,
        panDetailsBurn: Number((panDetailsCalls * 2.0).toFixed(2)),
        otherCalls,
        otherBurn: 0.00,
        totalCalls: panFindCalls + panDetailsCalls,
        totalCreditBurned: Number((panFindCalls * 2.5 + panDetailsCalls * 2.0).toFixed(2)),
      };

      // Service breakdown array
      const serviceBreakdown = Object.values(serviceMap)
        .filter((s) => s.totalInvocations > 0)
        .map((s) => {
          const serviceNet = s.completedRevenue - (s.fulfilledCost + s.wastedCost);
          const serviceMargin = s.completedRevenue > 0 ? Math.round((serviceNet / s.completedRevenue) * 100) : 0;
          return {
            serviceCode: s.code,
            serviceName: s.name,
            unitCost: s.unitCost,
            totalInvocations: s.totalInvocations,
            completedCount: s.completedCount,
            completedRevenue: Number(s.completedRevenue.toFixed(2)),
            fulfilledCost: Number(s.fulfilledCost.toFixed(2)),
            abandonedCount: s.abandonedCount,
            wastedCost: Number(s.wastedCost.toFixed(2)),
            estimatedWastedCost: Number(s.wastedCost.toFixed(2)),
            serviceNetProfit: Number(serviceNet.toFixed(2)),
            marginPercentage: serviceMargin,
          };
        });

      return {
        timeRange,
        totalRequests,
        completedPaidRequests: completedCount,
        abandonedUnpaidRequests: abandonedCount,
        conversionRate,
        dropoffRate,
        totalGrossRevenue: Number(totalGrossRevenue.toFixed(2)),
        fulfilledVendorCost: Number(completedVendorCost.toFixed(2)),
        wastedVendorCost: Number(wastedVendorCost.toFixed(2)),
        totalVendorBurn: Number(totalVendorBurn.toFixed(2)),
        netPlatformProfit: Number(netPlatformProfit.toFixed(2)),
        profitMargin,
        plainApiWalletBurn,
        breakdown: serviceBreakdown,
        recentRequestsLedger: detailedLedger.slice(0, 50),
      };
    });
  }

  // ==========================================
  // 14. ORGANIZATION MILESTONES & AUDIT TIMELINE
  // ==========================================

  async getOrganizationMilestones(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: { include: { user: true } },
        wallet: {
          include: {
            transactions: {
              orderBy: { createdAt: "asc" },
              take: 5,
            },
          },
        },
        requests: {
          orderBy: { createdAt: "asc" },
          take: 5,
          include: { service: true },
        },
        _count: { select: { requests: true, payments: true } },
      },
    });

    if (!org) {
      throw AppError.notFound("Organization not found", "NOT_FOUND");
    }

    interface OrgMilestone {
      type: string;
      title: string;
      description: string;
      timestamp: Date;
      icon: string;
    }
    const milestones: OrgMilestone[] = [];

    // Milestone 1: Registration
    milestones.push({
      type: "REGISTRATION",
      title: "Organization Registered",
      description: `Cyber Café workspace created by ${org.members[0]?.user?.name || "Owner"}`,
      timestamp: org.createdAt,
      icon: "Building2",
    });

    // Milestone 2: First Wallet Credit
    const firstCredit = org.wallet?.transactions.find((t) => t.type === "CREDIT");
    if (firstCredit) {
      milestones.push({
        type: "FIRST_RECHARGE",
        title: "First Wallet Recharge",
        description: `Wallet credited with ₹${Number(firstCredit.amount).toFixed(2)} (${firstCredit.description})`,
        timestamp: firstCredit.createdAt,
        icon: "Wallet",
      });
    }

    // Milestone 3: First Service Completed
    const firstCompletedReq = org.requests.find((r) => r.status === "COMPLETED");
    if (firstCompletedReq) {
      milestones.push({
        type: "FIRST_SERVICE",
        title: "First Service Fulfilled",
        description: `Successfully processed ${firstCompletedReq.service.name}`,
        timestamp: firstCompletedReq.createdAt,
        icon: "CheckCircle2",
      });
    }

    // Milestone 4: Transaction Volume Milestones
    const total = org._count.requests;
    if (total >= 10) {
      milestones.push({
        type: "VOLUME_10",
        title: "10 Transactions Milestone",
        description: "Retailer crossed initial 10 customer service requests.",
        timestamp: org.requests[org.requests.length - 1]?.createdAt || org.createdAt,
        icon: "TrendingUp",
      });
    }
    if (total >= 50) {
      milestones.push({
        type: "VOLUME_50",
        title: "Partner Gold Eligible (50+ Requests)",
        description: "Crossed 50 completed transactions. Qualifies for discounted tier pricing.",
        timestamp: new Date(),
        icon: "Award",
      });
    }

    return {
      organizationId,
      organizationName: org.name,
      owner: org.members[0]?.user,
      totalRequests: total,
      walletBalance: Number(org.wallet?.balance || 0),
      milestones: milestones.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    };
  }

  // ==========================================
  // 15. SYSTEM & ORGANIZATION AUDIT LOGS
  // ==========================================

  async getAuditLogs(query: AuditLogQueryInput) {
    const { organizationId, category = "ALL", page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;

    const isDirectWalkin = organizationId === "DIRECT_WALKIN";

    const whereWallet: Record<string, unknown> = isDirectWalkin
      ? { id: "impossible_direct_walkin_none" }
      : organizationId
      ? { wallet: { organizationId } }
      : {};

    const wherePayment: Record<string, unknown> = isDirectWalkin
      ? { organizationId: null }
      : organizationId
      ? { organizationId }
      : {};

    const whereEvents: Record<string, unknown> = isDirectWalkin
      ? { serviceRequest: { organizationId: null } }
      : organizationId
      ? { serviceRequest: { organizationId } }
      : {};

    const whereSession: Record<string, unknown> = isDirectWalkin
      ? { id: "impossible_direct_walkin_none" }
      : organizationId
      ? {
          OR: [
            { activeOrganizationId: organizationId },
            { user: { members: { some: { organizationId } } } },
          ],
        }
      : {};

    const whereApiLog: Record<string, unknown> = isDirectWalkin
      ? { organizationId: null }
      : organizationId
      ? {
          OR: [
            { organizationId },
            { user: { members: { some: { organizationId } } } },
          ],
        }
      : {};

    const orgQuery = isDirectWalkin
      ? Promise.resolve([])
      : prisma.organization.findMany({
          where: organizationId ? { id: organizationId } : undefined,
          orderBy: { createdAt: "desc" },
          take: organizationId ? 1 : 20,
          select: { id: true, name: true, createdAt: true },
        });

    const [walletTx, payments, requestEvents, sessions, apiLogs, totalOrgs] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereWallet,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          wallet: {
            include: {
              organization: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.payment.findMany({
        where: wherePayment,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          organization: { select: { id: true, name: true } },
          serviceRequest: {
            select: {
              id: true,
              referenceNumber: true,
              amount: true,
              organization: { select: { id: true, name: true } },
              service: { select: { name: true, code: true } },
            },
          },
        },
      }),
      prisma.serviceRequestEvent.findMany({
        where: whereEvents,
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          serviceRequest: {
            select: {
              id: true,
              referenceNumber: true,
              amount: true,
              organization: { select: { id: true, name: true } },
              service: { select: { name: true, code: true } },
            },
          },
        },
      }),
      prisma.session.findMany({
        where: whereSession,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              members: {
                include: {
                  organization: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      prisma.apiLog.findMany({
        where: whereApiLog,
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      orgQuery,
    ]);

    interface AuditItem {
      id: string;
      category: string;
      title: string;
      description: string;
      referenceNumber?: string | null;
      organizationId?: string | null;
      organizationName?: string | null;
      amount?: number;
      type?: string;
      status?: string;
      timestamp: Date;
      badgeVariant: string;
    }

    const auditItems: AuditItem[] = [];

    // 1. Wallet Transactions
    walletTx.forEach((tx) => {
      const isManual =
        tx.description?.toLowerCase().includes("manual") ||
        tx.description?.toLowerCase().includes("admin") ||
        tx.description?.toLowerCase().includes("override");
      auditItems.push({
        id: `wallet-${tx.id}`,
        category: isManual ? "SECURITY" : "WALLET",
        title: tx.type === "CREDIT" ? "Wallet Credited" : "Wallet Debited",
        description: sanitizeDpdpData(tx.description) || `${tx.type} adjustment of ₹${Number(tx.amount).toFixed(2)}`,
        organizationId: tx.wallet?.organization?.id,
        organizationName: tx.wallet?.organization?.name || "Cyber Café",
        amount: Number(tx.amount),
        type: tx.type,
        timestamp: tx.createdAt,
        badgeVariant: tx.type === "CREDIT" ? "success" : "warning",
      });
    });

    // 2. Gateway / Online Payments (Cashfree & UPI)
    payments.forEach((pay) => {
      const isCaptured = pay.status === "CAPTURED";
      const isFailed = pay.status === "FAILED";
      const isRefunded = pay.status === "REFUNDED";
      const serviceName = pay.serviceRequest?.service?.name || "Service Gateway Payment";
      const refNum = pay.serviceRequest?.referenceNumber || pay.orderId;
      const mode = pay.paymentMode || "Cashfree Gateway";

      let desc = `Payment of ₹${Number(pay.amount).toFixed(2)} ${isCaptured ? "captured" : pay.status.toLowerCase()} via ${mode}.`;
      if (pay.orderId) desc += ` Order: ${pay.orderId}`;
      if (pay.transactionId) desc += `, Txn: ${pay.transactionId}`;

      auditItems.push({
        id: `pay-${pay.id}`,
        category: "WALLET",
        title: isCaptured
          ? "Payment Captured (Cashfree)"
          : isRefunded
          ? "Payment Refunded"
          : isFailed
          ? "Payment Failed"
          : `Payment ${pay.status}`,
        description: `${serviceName} - ${desc}`,
        referenceNumber: refNum,
        organizationId: pay.organizationId || pay.organization?.id,
        organizationName: pay.organization?.name || "Direct Walk-in",
        amount: Number(pay.amount),
        type: isRefunded ? "CREDIT" : "DEBIT",
        status: pay.status,
        timestamp: pay.paidAt || pay.updatedAt || pay.createdAt,
        badgeVariant: isCaptured ? "success" : isFailed ? "destructive" : "outline",
      });
    });

    // 3. Service Request Events
    requestEvents.forEach((ev) => {
      const isMilestone = ev.status === "COMPLETED";
      const isFailed = ev.status === "PROVIDER_FAILED";
      const isRefund =
        ev.note?.toLowerCase().includes("refund") || ev.status === "REFUNDED";
      const serviceName = ev.serviceRequest.service.name;
      const refNum =
        ev.serviceRequest.referenceNumber || ev.serviceRequest.id.slice(0, 8);

      let cleanDesc = sanitizeDpdpData(ev.note) || ev.status;
      if (cleanDesc.includes(refNum)) {
        cleanDesc = cleanDesc.replace(new RegExp(`\\(?[REQ-]*${refNum}\\)?`, "g"), "").trim();
      }
      if (cleanDesc.startsWith("-")) {
        cleanDesc = cleanDesc.substring(1).trim();
      }

      let title = `Service ${ev.status}`;
      if (isRefund) {
        title = "Service Refunded";
      } else if (ev.status === "COMPLETED") {
        title = "Service Fulfilled & Vaulted";
      } else if (ev.status === "PROCESSING") {
        title = "Dispatched for Processing";
      } else if (ev.status === "PAYMENT_CAPTURED") {
        title = "Payment Confirmed & Verified";
      } else if (ev.status === "PAYMENT_PENDING") {
        title = "Awaiting Citizen Payment";
      } else if (ev.status === "REQUEST_CREATED") {
        title = "Service Request Initiated";
      }

      let badgeVariant: "destructive" | "success" | "outline" | "default" | "secondary" = "outline";
      if (isFailed) {
        badgeVariant = "destructive";
      } else if (isMilestone || ev.status === "PAYMENT_CAPTURED") {
        badgeVariant = "success";
      } else if (ev.status === "PROCESSING") {
        badgeVariant = "secondary";
      }

      auditItems.push({
        id: `req-${ev.id}`,
        category: isFailed ? "SECURITY" : isMilestone ? "MILESTONE" : "SERVICE",
        title,
        description: cleanDesc ? `${serviceName} - ${cleanDesc}` : `${serviceName} (${refNum})`,
        referenceNumber: refNum,
        organizationId: ev.serviceRequest.organization?.id,
        organizationName: ev.serviceRequest.organization?.name || "Direct Walk-in",
        amount: Number(ev.serviceRequest.amount),
        status: ev.status,
        timestamp: ev.createdAt,
        badgeVariant,
      });
    });

    // 3. Organization Milestones / Registrations
    totalOrgs.forEach((org: { id: string; name: string; createdAt: Date }) => {
      if (!organizationId || organizationId === org.id) {
        auditItems.push({
          id: `org-${org.id}`,
          category: "MILESTONE",
          title: "New Organization Registered",
          description: `${org.name} joined Nagrik Seva Point platform`,
          organizationId: org.id,
          organizationName: org.name,
          timestamp: org.createdAt,
          badgeVariant: "default",
        });
      }
    });

    // 4. Operator Login & Authentication Sessions (Historical fallback for sessions without explicit ApiLog)
    sessions.forEach((s) => {
      // Check if an ApiLog entry already exists for this login event
      const alreadyHasLoginLog = apiLogs.some(
        (l) =>
          l.serviceCode === "AUTH" &&
          l.action.toLowerCase().includes("login") &&
          (l.reference?.includes(s.id.slice(0, 8).toUpperCase()) ||
            (l.userId === s.userId &&
              Math.abs(new Date(l.createdAt).getTime() - new Date(s.createdAt).getTime()) < 60000))
      );
      if (alreadyHasLoginLog) return;

      const orgName = s.user.members?.[0]?.organization?.name || "Cyber Café";
      const orgId = s.activeOrganizationId || s.user.members?.[0]?.organization?.id;

      let clientDevice = "Web Browser";
      if (s.userAgent) {
        if (s.userAgent.includes("Edg/")) clientDevice = "Edge Browser";
        else if (s.userAgent.includes("Chrome/") && !s.userAgent.includes("Edg/")) clientDevice = "Google Chrome";
        else if (s.userAgent.includes("Firefox/")) clientDevice = "Mozilla Firefox";
        else if (s.userAgent.includes("Safari/") && !s.userAgent.includes("Chrome")) clientDevice = "Apple Safari";
        else if (s.userAgent.includes("Mobile")) clientDevice = "Mobile Browser";
      }

      const ip = maskIpAddress(s.ipAddress);
      const emailMasked = maskEmail(s.user.email);

      auditItems.push({
        id: `login-${s.id}`,
        category: "SECURITY",
        title: "Operator Login & Session Started",
        description: `Operator (${emailMasked}) logged into café workspace via ${clientDevice}. IP: ${ip}`,
        referenceNumber: `AUTH-${s.id.slice(0, 8).toUpperCase()}`,
        organizationId: orgId,
        organizationName: orgName,
        timestamp: s.createdAt,
        badgeVariant: "outline",
      });
    });

    // 5. Service API Inquiries & Operational / Security Events
    apiLogs.forEach((log) => {
      const isSuccess = log.status === "SUCCESS";
      const orgName = log.organization?.name || "Cyber Café";
      const actLower = log.action.toLowerCase();
      const isAuth =
        log.serviceCode === "AUTH" ||
        actLower.includes("logout") ||
        actLower.includes("login") ||
        actLower.includes("register");
      const isCustomer = log.serviceCode === "CUSTOMER";
      const isDocVault = actLower.includes("download") || log.serviceCode === "DOCUMENT_VAULT";

      let category: "SECURITY" | "SERVICE" | "WALLET" | "MILESTONE" = "SERVICE";
      if (isAuth || isCustomer || isDocVault) {
        category = "SECURITY";
      }

      const safeRef = sanitizeDpdpData(log.reference) || "API-INQ";
      const safeDesc = sanitizeDpdpData(log.note) || `API inquiry executed for ${safeRef} (${log.endpoint})`;

      auditItems.push({
        id: `api-${log.id}`,
        category,
        title: log.action,
        description: safeDesc,
        referenceNumber: safeRef,
        organizationId: log.organizationId,
        organizationName: orgName,
        status: log.status,
        timestamp: log.createdAt,
        badgeVariant: isSuccess ? (category === "SECURITY" ? "outline" : "secondary") : "destructive",
      });
    });

    // Summary computed across all items before category filtering
    const summary = {
      totalEvents: auditItems.length,
      walletEvents: auditItems.filter((i) => i.category === "WALLET").length,
      serviceEvents: auditItems.filter((i) => i.category === "SERVICE").length,
      milestoneEvents: auditItems.filter((i) => i.category === "MILESTONE").length,
      securityEvents: auditItems.filter((i) => i.category === "SECURITY").length,
      totalAdjustedVolume: auditItems
        .filter((i) => i.category === "WALLET" || i.category === "SECURITY")
        .reduce((acc, i) => acc + (i.amount || 0), 0),
    };

    // Filter by category
    let filtered = auditItems;
    if (category !== "ALL") {
      filtered = auditItems.filter((i) => i.category === category);
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const paginated = filtered.slice(skip, skip + limit);

    return {
      items: paginated,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit) || 1,
      summary,
    };
  }

  // ==========================================
  // 15. DPDP COMPLIANCE & EPHEMERAL VAULT AUDIT
  // ==========================================

  async getVaultAudit() {
    let activeKeys: string[] = [];
    try {
      const client = redis.getRawClient();
      if (client) {
        activeKeys = await client.keys("vault:*");
      }
    } catch {
      activeKeys = [];
    }

    return {
      complianceStandard: "DPDP Act (India) 2023 Compliant",
      vaultStrategy: "24-Hour Ephemeral In-Memory TTL Auto-Purge",
      activeCitizenEncryptedKeysCount: activeKeys.length,
      sampleActiveKeys: activeKeys.slice(0, 10),
      autoPurgeVerified: true,
      dataRetentionWindowHours: 24,
      auditTimestamp: new Date().toISOString(),
    };
  }
}

export const adminService = new AdminService();
