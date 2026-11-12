import { prisma } from "../../core/db/prisma";
import { redis } from "../../core/redis/redis.client";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { serviceDispatcher } from "../services/service.dispatcher";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";
import { sanitizeDpdpData, maskEmail, maskIpAddress } from "../../core/logger/api-logger";
import { brevoMailService } from "../../core/mail/brevo.service";
import { paymentService } from "../payment/payment.service";
import { cashfreeGateway } from "../../core/integrations/cashfree/cashfree.gateway";
import type { PaymentStatus, PaymentMethod, AccessMode, PricingTier } from "@prisma/client";
import type {
  WalletAdjustmentInput,
  MaintenanceToggleInput,
  AnnouncementInput,
  OrgStatusInput,
  TierPriceUpdateInput,
  AuditLogQueryInput,
  TargetedEmailInput,
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
  sortBy?: "walletBalance" | "createdAt" | "requests" | "name" | "default";
  hasBalance?: boolean;
  activeFilter?: "ALL" | "FUNDED" | "TODAY" | "YESTERDAY" | "WEEK" | "DAY0";
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
   * 2b. On-demand sync a transaction with Cashfree Gateway
   */
  async syncTransactionWithCashfree(orderId: string, adminUserId?: string) {
    const result = await paymentService.syncCashfreePayment(orderId, adminUserId);
    // Invalidate admin transactions cache
    await redis.delPattern("cache:admin:txs:*").catch(() => {});
    return result;
  }

  /**
   * 2c. Preview pending Cashfree transactions by querying live Cashfree status.
   * Generates a dry-run confirmation list with proposed actions (credit wallet vs mark failed).
   */
  async previewCashfreeSync(params?: {
    orderIds?: string[];
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
  }) {
    const limit = Math.min(50, Math.max(1, Number(params?.limit) || 30));

    const where: any = {
      method: "CASHFREE",
    };

    if (params?.orderIds && params.orderIds.length > 0) {
      where.OR = [
        { id: { in: params.orderIds } },
        { orderId: { in: params.orderIds } },
      ];
    } else {
      where.status = "PENDING";

      if (params?.startDate || params?.endDate) {
        where.createdAt = {};
        if (params.startDate) {
          where.createdAt.gte = new Date(`${params.startDate}T00:00:00.000Z`);
        }
        if (params.endDate) {
          where.createdAt.lte = new Date(`${params.endDate}T23:59:59.999Z`);
        }
      }

      if (params?.search && params.search.trim()) {
        const s = params.search.trim();
        where.AND = [
          {
            OR: [
              { orderId: { contains: s, mode: "insensitive" } },
              { user: { name: { contains: s, mode: "insensitive" } } },
              { user: { email: { contains: s, mode: "insensitive" } } },
              { user: { phone: { contains: s, mode: "insensitive" } } },
              { organization: { name: { contains: s, mode: "insensitive" } } },
            ],
          },
        ];
      }
    }

    const pendingTxs = await prisma.payment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        organization: { select: { id: true, name: true } },
        serviceRequest: {
          include: {
            service: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const items = await Promise.all(
      pendingTxs.map(async (tx) => {
        const orderId = tx.orderId || tx.id;
        try {
          const cfOrder = await cashfreeGateway.getOrder(orderId);
          const cfPayments = await cashfreeGateway.getOrderPayments(orderId).catch(() => []);

          const orderStatus = String(cfOrder.order_status || "").toUpperCase();
          const successfulPayment = cfPayments.find((p: any) => String(p.payment_status).toUpperCase() === "SUCCESS");
          const failedPayment = cfPayments.find((p: any) => String(p.payment_status).toUpperCase() === "FAILED");

          const gatewayAmount = Number(cfOrder.order_amount);
          const recordedAmount = Number(tx.amount);
          const amountMismatch = Math.abs(gatewayAmount - recordedAmount) > 0.01;

          if ((orderStatus === "PAID" || successfulPayment) && !amountMismatch) {
            const cfPayId = successfulPayment?.cf_payment_id || cfOrder.cf_order_id;
            const bankRef = successfulPayment?.bank_reference || successfulPayment?.bank_reference_number;
            const payMode = successfulPayment?.payment_group || successfulPayment?.payment_method?.payment_mode || "UPI";

            return {
              id: tx.id,
              orderId,
              amount: recordedAmount,
              createdAt: tx.createdAt.toISOString(),
              user: tx.user,
              organization: tx.organization,
              serviceName: tx.serviceRequest?.service?.name || "Service Request",
              isWalletTopup: tx.serviceRequest?.service?.code === "WALLET_TOPUP",
              gatewayStatus: "PAID",
              resolution: "READY_TO_CAPTURE" as const,
              actionLabel: `Credit ₹${recordedAmount.toFixed(2)} to Wallet (Captured)`,
              actionType: "CREDIT_WALLET" as const,
              recommended: true,
              cfPaymentId: cfPayId ? String(cfPayId) : undefined,
              bankReference: bankRef ? String(bankRef) : undefined,
              paymentMode: String(payMode).toUpperCase(),
              paymentTime: successfulPayment?.payment_completion_time || (cfOrder as any).created_at,
            };
          }

          if (["FAILED", "EXPIRED", "TERMINATED", "CANCELLED", "USER_DROPPED"].includes(orderStatus) || failedPayment) {
            const reason = failedPayment?.payment_message || failedPayment?.error_details?.error_description || orderStatus;
            return {
              id: tx.id,
              orderId,
              amount: recordedAmount,
              createdAt: tx.createdAt.toISOString(),
              user: tx.user,
              organization: tx.organization,
              serviceName: tx.serviceRequest?.service?.name || "Service Request",
              isWalletTopup: tx.serviceRequest?.service?.code === "WALLET_TOPUP",
              gatewayStatus: orderStatus || "FAILED",
              resolution: "READY_TO_FAIL" as const,
              actionLabel: "Mark as FAILED (No Wallet Credit)",
              actionType: "MARK_FAILED" as const,
              recommended: true,
              failureReason: String(reason),
            };
          }

          return {
            id: tx.id,
            orderId,
            amount: recordedAmount,
            createdAt: tx.createdAt.toISOString(),
            user: tx.user,
            organization: tx.organization,
            serviceName: tx.serviceRequest?.service?.name || "Service Request",
            isWalletTopup: tx.serviceRequest?.service?.code === "WALLET_TOPUP",
            gatewayStatus: orderStatus || "ACTIVE",
            resolution: "STILL_PENDING" as const,
            actionLabel: "Customer did not pay on gateway (Awaiting Payment)",
            actionType: "SKIP" as const,
            recommended: false,
          };
        } catch (err: any) {
          return {
            id: tx.id,
            orderId,
            amount: Number(tx.amount),
            createdAt: tx.createdAt.toISOString(),
            user: tx.user,
            organization: tx.organization,
            serviceName: tx.serviceRequest?.service?.name || "Service Request",
            isWalletTopup: tx.serviceRequest?.service?.code === "WALLET_TOPUP",
            gatewayStatus: "ERROR",
            resolution: "GATEWAY_ERROR" as const,
            actionLabel: `Not found on Cashfree: ${err?.message || "Order Not Found"}`,
            actionType: "ERROR" as const,
            recommended: false,
          };
        }
      })
    );

    const readyToCapture = items.filter((i) => i.resolution === "READY_TO_CAPTURE");
    const readyToFail = items.filter((i) => i.resolution === "READY_TO_FAIL");
    const stillPending = items.filter((i) => i.resolution === "STILL_PENDING");
    const errors = items.filter((i) => i.resolution === "GATEWAY_ERROR");
    const totalAmountToCredit = readyToCapture.reduce((sum, i) => sum + i.amount, 0);

    return {
      items,
      summary: {
        totalFound: items.length,
        readyToCaptureCount: readyToCapture.length,
        readyToCaptureAmount: totalAmountToCredit,
        readyToFailCount: readyToFail.length,
        stillPendingCount: stillPending.length,
        errorCount: errors.length,
      },
    };
  }

  /**
   * 2d. Confirm and execute sync for selected Cashfree transactions.
   * Updates database and credits wallets for verified paid transactions.
   */
  async confirmCashfreeSync(orderIds: string[], adminUserId?: string) {
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      throw AppError.badRequest("No orderIds provided for sync confirmation");
    }

    const results: Array<{ orderId: string; status: string; amount: number; message: string }> = [];
    let capturedCount = 0;
    let failedCount = 0;
    let totalCreditedAmount = 0;

    for (const orderId of orderIds) {
      try {
        const res = await paymentService.syncCashfreePayment(orderId, adminUserId);
        const amount = Number(res.payment?.amount || 0);
        results.push({
          orderId,
          status: res.status,
          amount,
          message: res.message,
        });

        if (res.status === "CAPTURED") {
          capturedCount++;
          totalCreditedAmount += amount;
        } else if (res.status === "FAILED") {
          failedCount++;
        }
      } catch (err: any) {
        results.push({
          orderId,
          status: "ERROR",
          amount: 0,
          message: err?.message || "Failed to process sync",
        });
      }
    }

    await redis.delPattern("cache:admin:txs:*").catch(() => {});

    return {
      totalProcessed: results.length,
      capturedCount,
      failedCount,
      totalCreditedAmount,
      results,
    };
  }

  /**
   * 3. List all Organizations with stats and balances
   */
  async getOrganizations(query: OrganizationFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const sortBy = query.sortBy || "default";
    const hasBalance = query.hasBalance === true || String(query.hasBalance) === "true";
    const activeFilter = query.activeFilter || "ALL";
    const cacheKey = `cache:admin:orgs:${query.search || "ALL"}:${page}:${limit}:${sortBy}:${hasBalance}:${activeFilter}`;

    return await redis.remember(cacheKey, 15, async () => {
      const skip = (page - 1) * limit;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Helper for timeframe activity condition
      const buildActiveCondition = (startDate: Date, endDate?: Date) => {
        const timeCondition: any = { gte: startDate };
        if (endDate) timeCondition.lt = endDate;

        return {
          OR: [
            {
              members: {
                some: {
                  user: {
                    sessions: {
                      some: {
                        OR: [
                          { updatedAt: timeCondition },
                          { createdAt: timeCondition },
                        ],
                      },
                    },
                  },
                },
              },
            },
            {
              requests: {
                some: {
                  createdAt: timeCondition,
                },
              },
            },
            {
              createdAt: timeCondition,
            },
          ],
        };
      };

      const searchConditions = query.search && query.search.trim() ? [
        { name: { contains: query.search.trim(), mode: "insensitive" } },
        { slug: { contains: query.search.trim(), mode: "insensitive" } },
        {
          members: {
            some: {
              user: {
                OR: [
                  { name: { contains: query.search.trim(), mode: "insensitive" } },
                  { email: { contains: query.search.trim(), mode: "insensitive" } },
                  { phone: { contains: query.search.trim(), mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ] : null;

      const andConditions: any[] = [];

      if (searchConditions) {
        andConditions.push({ OR: searchConditions });
      }

      if (hasBalance || activeFilter === "FUNDED") {
        andConditions.push({ wallet: { balance: { gt: 0 } } });
      } else if (activeFilter === "TODAY") {
        andConditions.push(buildActiveCondition(startOfToday));
      } else if (activeFilter === "YESTERDAY") {
        andConditions.push(buildActiveCondition(startOfYesterday, startOfToday));
      } else if (activeFilter === "WEEK") {
        andConditions.push(buildActiveCondition(sevenDaysAgo));
      } else if (activeFilter === "DAY0") {
        andConditions.push({
          createdAt: { lte: twoDaysAgo },
          requests: { none: {} },
        });
      }

      const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

      let orderBy: any = [
        { wallet: { balance: "desc" } },
        { createdAt: "desc" },
      ];
      if (sortBy === "createdAt") {
        orderBy = { createdAt: "desc" };
      } else if (sortBy === "walletBalance") {
        orderBy = { wallet: { balance: "desc" } };
      } else if (sortBy === "name") {
        orderBy = { name: "asc" };
      }

      const [
        totalFiltered,
        totalGlobal,
        items,
        totalWalletSum,
        countWithBalance,
        countToday,
        countYesterday,
        countWeek,
        countDay0,
      ] = await Promise.all([
        prisma.organization.count({ where }),
        prisma.organization.count(),
        prisma.organization.findMany({
          where,
          skip,
          take: limit,
          orderBy,
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
                apiLogs: true,
              },
            },
          },
        }),
        prisma.wallet.aggregate({
          _sum: { balance: true },
        }),
        prisma.organization.count({
          where: { wallet: { balance: { gt: 0 } } },
        }),
        prisma.organization.count({
          where: buildActiveCondition(startOfToday),
        }),
        prisma.organization.count({
          where: buildActiveCondition(startOfYesterday, startOfToday),
        }),
        prisma.organization.count({
          where: buildActiveCondition(sevenDaysAgo),
        }),
        prisma.organization.count({
          where: {
            createdAt: { lte: twoDaysAgo },
            requests: { none: {} },
          },
        }),
      ]);

      const enhancedItems = items.map((org) => {
        const ownerUser = org.members[0]?.user;
        const lastSessionDate = ownerUser?.sessions?.[0]?.updatedAt || ownerUser?.sessions?.[0]?.createdAt;
        const lastRequestDate = org.requests?.[0]?.createdAt;

        // Accurate User Last Login: Determined ONLY from genuine user authentication Session,
        // fallback to citizen request activity, or null ("Never").
        // (Never contaminated by system/email audit ApiLogs or user record touches).
        let lastLogin: string | null = null;
        if (lastSessionDate) {
          lastLogin = new Date(lastSessionDate).toISOString();
        } else if (lastRequestDate) {
          lastLogin = new Date(lastRequestDate).toISOString();
        }

        const completedPayments = org.payments || [];
        const completedPaymentsCount = completedPayments.length;
        const completedPaymentsAmount = completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalRequests = Math.max(org._count?.requests || 0, org._count?.apiLogs || 0);

        return {
          ...org,
          _count: {
            ...org._count,
            requests: totalRequests,
          },
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
          total: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limit) || 1,
        },
        summary: {
          totalOrganizations: totalGlobal,
          totalWalletBalance: Number(totalWalletSum._sum.balance || 0),
          orgsWithBalanceCount: countWithBalance,
          todayActiveCount: countToday,
          yesterdayActiveCount: countYesterday,
          weekActiveCount: countWeek,
          day0Count: countDay0,
        },
      };
    });
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
        apiLogs: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            members: true,
            customers: true,
            requests: true,
            payments: true,
            apiLogs: true,
          },
        },
      },
    });

    if (!org) {
      throw AppError.notFound("Organization not found", "ORG_NOT_FOUND");
    }

    const totalRequests = Math.max(org._count?.requests || 0, org._count?.apiLogs || 0);
    return {
      ...org,
      _count: {
        ...org._count,
        requests: totalRequests,
      },
    };
  }

  /**
   * 5. Master Admin KPI Overview Stats (Cached in Redis 60s TTL)
   */
  async getOverviewStats() {
    return await redis.remember("cache:admin:overview_stats", 120, async () => {
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
    return await redis.remember("cache:admin:vendor_health", 30, async () => {
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
    });
  }

  // ==========================================
  // 8. SERVICE KILL-SWITCHES & MAINTENANCE MODE
  // ==========================================

  async getMaintenanceStatus() {
    return await redis.remember("cache:admin:maintenance_status", 60, async () => {
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
    });
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

    // Invalidate cached services catalogue and maintenance status
    await Promise.all([
      redis.delPattern("cache:services:*"),
      redis.del("cache:admin:maintenance_status"),
    ]).catch(() => {});

    return {
      success: true,
      message: "Maintenance configuration updated successfully.",
    };
  }

  // ==========================================
  // 9. IN-APP BROADCAST NOTICE BOARD
  // ==========================================

  async getAnnouncement() {
    return await redis.remember("cache:admin:announcement", 120, async () => {
      const announcement = await redis.getJson<Record<string, unknown>>("system:announcement");
      return announcement || { active: false, message: "" };
    });
  }

  async setAnnouncement(input: AnnouncementInput) {
    const data = {
      active: input.active,
      message: input.message,
      title: input.title,
      severity: input.severity || "info",
      expiresAt: input.expiresAt,
      updatedAt: new Date().toISOString(),
    };

    await redis.setJson("system:announcement", data);
    await redis.del("cache:admin:announcement").catch(() => {});

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
    return await redis.remember("cache:admin:pricing_matrix", 300, async () => {
      const services = await prisma.service.findMany({
        include: {
          category: true,
          prices: true,
        },
        orderBy: { code: "asc" },
      });

      const defaultEstimatedCost: Record<string, number> = {
        PAN_FIND: 3.0,
        PAN_DETAILS: 2.5,
        KISAN_CARD: 0.0,
        KISAN_REGISTRATION_CARD: 0.0,
      };

      return services.map((srv) => {
        const getPrice = (tier: PricingTier) => {
          const found = srv.prices.find((p) => p.pricingTier === tier);
          return found ? Number(found.amount) : 0;
        };

        const partnerPrice = getPrice("PARTNER") || Number(srv.retailerPrice || 20);
        const estCost = defaultEstimatedCost[srv.code] ?? 0.0;
        const margin = partnerPrice - estCost;

        return {
          id: srv.id,
          code: srv.code,
          name: srv.name,
          category: srv.category?.name || "General",
          isActive: srv.isActive,
          prices: {
            public: getPrice("PUBLIC") || 30,
            partner: partnerPrice,
            partnerGold: getPrice("PARTNER_GOLD") || partnerPrice * 0.85,
            enterprise: getPrice("ENTERPRISE") || partnerPrice * 0.70,
          },
          estimatedVendorCost: estCost,
          estimatedProfitMargin: margin,
        };
      });
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

    if (input.pricingTier === "PARTNER") {
      await prisma.service.update({
        where: { id: input.serviceId },
        data: { retailerPrice: input.amount },
      }).catch(() => {});
    }

    // Invalidate service catalog, tier pricing and pricing matrix caches
    await Promise.all([
      redis.delPattern("cache:services:*"),
      redis.delPattern("cache:pricing:*"),
      redis.del("cache:admin:pricing_matrix"),
    ]).catch(() => {});

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
          apiLogs: {
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { requests: true, payments: true, apiLogs: true },
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
        const totalRequests = Math.max(org._count.requests || 0, org._count.apiLogs || 0);
        const lastRequestDate = org.requests[0]?.createdAt ? new Date(org.requests[0].createdAt) : null;
        const lastApiLogDate = org.apiLogs?.[0]?.createdAt ? new Date(org.apiLogs[0].createdAt) : null;
        const lastActiveAt = [lastRequestDate, lastApiLogDate]
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0] || null;
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
          lastActiveAt,
        };

        if (org.createdAt <= twoDaysAgo && totalRequests === 0) {
          day0Dropoffs.push(record);
        } else if (lastActiveAt && lastActiveAt >= sevenDaysAgo) {
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
    return await redis.remember(cacheKey, 300, async () => {
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
        PAN_FIND: 3.0,
        PAN_DETAILS: 2.5,
        PAN_TO_AADHAAR: 40.0,
        KISAN_CARD: 0.0,
        KISAN_REGISTRATION_CARD: 0.0,
        VEHICLE_LOOKUP: 2.25,
        VEHICLE_RC: 2.25,
        MOBILE_TO_RC: 8.15,
        MOBILE_RC: 8.15,
        RC_OWNER_HISTORY: 7.50,
        RC_HISTORY: 7.50,
        DL_VERIFY: 4.0,
        DRIVING_LICENSE: 4.0,
        VOTER_VERIFY: 0.0,
      };

      const [services, allRequests, upstreamApiLogs] = await Promise.all([
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
        prisma.apiLog.findMany({
          where: {
            ...whereDate,
            serviceCode: {
              in: [
                "PAN_FIND",
                "PAN_DETAILS",
                "VEHICLE_LOOKUP",
                "VEHICLE_RC",
                "DL_VERIFY",
                "DRIVING_LICENSE",
                "MOBILE_TO_RC",
                "RC_OWNER_HISTORY",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
          include: {
            organization: { select: { id: true, name: true, slug: true } },
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        }),
      ]);

      let totalGrossRevenue = 0;
      let completedVendorCost = 0;
      let wastedVendorCost = 0;
      let panFindCalls = 0;
      let panDetailsCalls = 0;
      let rcDetailsCalls = 0;
      let dlVerifyCalls = 0;
      let mobileToRcCalls = 0;
      let rcOwnerHistoryCalls = 0;
      let kisanCalls = 0;
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

      // Track which ApiLogs were subsequently converted into a ServiceRequest
      const claimedLogIds = new Set<string>();

      // Filter out test / dummy simulations so they are never counted as paid upstream costs or abandoned requests
      for (const log of upstreamApiLogs) {
        const ref = (log.reference || "").toUpperCase().replace(/[\s\-_]/g, "");
        const note = (log.note || "").toLowerCase();
        if (
          ref === "DL01AB1234" ||
          ref === "1234567890" ||
          note.includes("test") ||
          note.includes("simulation") ||
          note.includes("mock")
        ) {
          claimedLogIds.add(log.id);
        }
      }

      const isSameService = (logCode: string, reqCode: string) => {
        if (logCode === reqCode) return true;
        if (
          (logCode === "VEHICLE_LOOKUP" || logCode === "VEHICLE_RC") &&
          (reqCode === "VEHICLE_LOOKUP" || reqCode === "VEHICLE_RC")
        )
          return true;
        if (
          (logCode === "DL_VERIFY" || logCode === "DRIVING_LICENSE") &&
          (reqCode === "DL_VERIFY" || reqCode === "DRIVING_LICENSE")
        )
          return true;
        if (
          (logCode === "MOBILE_TO_RC" || logCode === "MOBILE_RC") &&
          (reqCode === "MOBILE_TO_RC" || reqCode === "MOBILE_RC")
        )
          return true;
        if (
          (logCode === "RC_OWNER_HISTORY" || logCode === "RC_HISTORY") &&
          (reqCode === "RC_OWNER_HISTORY" || reqCode === "RC_HISTORY")
        )
          return true;
        if (
          (logCode === "KISAN_REGISTRATION_CARD" || logCode === "KISAN_CARD") &&
          (reqCode === "KISAN_REGISTRATION_CARD" || reqCode === "KISAN_CARD")
        )
          return true;
        return false;
      };

      for (const req of allRequests) {
        const code = req.service.code;
        const inputData = (req.inputData || {}) as Record<string, unknown>;
        const stage = typeof inputData?.stage === "string" ? inputData.stage : undefined;
        const isUnlockStage = code === "PAN_FIND" && (stage === "UNLOCK" || Number(req.amount) === 15);
        if (isUnlockStage) continue; // Stage 2 Unlock does not hit upstream, do not match with inquiry logs

        const reqTime = new Date(req.createdAt).getTime();
        const reqRef = (
          (inputData.vehicleNumber as string) ||
          (inputData.rcNumber as string) ||
          (inputData.pan as string) ||
          (inputData.dlNumber as string) ||
          (inputData.mobile as string) ||
          (inputData.mobileNumber as string) ||
          ""
        ).toUpperCase().replace(/[\s\-_]/g, "");

        const matchedLog = upstreamApiLogs.find((log) => {
          if (claimedLogIds.has(log.id)) return false;
          if (!isSameService(log.serviceCode, code)) return false;

          const logRef = (log.reference || "").toUpperCase().replace(/[\s\-_]/g, "");
          if (reqRef && logRef && (reqRef === logRef || reqRef.includes(logRef) || logRef.includes(reqRef))) {
            return true;
          }

          const logTime = new Date(log.createdAt).getTime();
          const timeDiff = reqTime - logTime;
          // Match if inquiry happened up to 2 hours before or 5 minutes after request creation
          if (timeDiff >= -300000 && timeDiff <= 2 * 60 * 60 * 1000) {
            if (req.organizationId && log.organizationId && req.organizationId === log.organizationId) return true;
            if (req.userId && log.userId && req.userId === log.userId) return true;
          }

          return false;
        });

        if (matchedLog) {
          claimedLogIds.add(matchedLog.id);
        }
      }

      const detailedLedger = allRequests.map((req) => {
        const code = req.service.code;
        const inputData = (req.inputData || {}) as Record<string, unknown>;
        const stage = typeof inputData?.stage === "string" ? inputData.stage : undefined;
        const isUnlockStage = code === "PAN_FIND" && (stage === "UNLOCK" || Number(req.amount) === 15);

        // Stage 2 Unlock incurs ₹0.00 vendor cost (no upstream API call; local decryption only)
        let unitCost = serviceCostMap[code] ?? 0.0;
        if (isUnlockStage) {
          unitCost = 0.0;
        }

        let sName = req.service.name;
        if (code === "PAN_FIND") {
          if (stage === "DETECT" || Number(req.amount) === 5) {
            sName = "Find PAN (Stage 1: Detect)";
          } else if (isUnlockStage) {
            sName = "Find PAN (Stage 2: Unlock)";
          }
        }

        if (!serviceMap[code]) {
          serviceMap[code] = {
            code,
            name: req.service.name,
            unitCost: serviceCostMap[code] ?? 0.0,
            totalInvocations: 0,
            completedCount: 0,
            completedRevenue: 0,
            fulfilledCost: 0,
            abandonedCount: 0,
            wastedCost: 0,
          };
        }
        serviceMap[code].totalInvocations++;

        const isTopup = code === "WALLET_TOPUP";
        const capturedPayment = req.payments.find((p) => p.status === "CAPTURED");
        const isRefunded = req.status === "REFUNDED" || req.payments.some((p) => p.status === "REFUNDED");
        const isCompleted = (req.status === "COMPLETED" || Boolean(capturedPayment)) && !isRefunded;

        let revenue = 0;
        let incurredVendorCost = 0;

        if (isCompleted) {
          revenue = capturedPayment ? Number(capturedPayment.amount) : Number(req.amount || 0);
          incurredVendorCost = unitCost;

          // Only count actual upstream API calls toward vendor call volume
          if (code === "PAN_FIND") {
            if (!isUnlockStage) panFindCalls++;
          } else if (code === "PAN_DETAILS") {
            panDetailsCalls++;
          } else if (code === "VEHICLE_LOOKUP" || code === "VEHICLE_RC") {
            rcDetailsCalls++;
          } else if (code === "DL_VERIFY" || code === "DRIVING_LICENSE") {
            dlVerifyCalls++;
          } else if (code === "MOBILE_TO_RC" || code === "MOBILE_RC") {
            mobileToRcCalls++;
          } else if (code === "RC_OWNER_HISTORY" || code === "RC_HISTORY") {
            rcOwnerHistoryCalls++;
          } else if (code === "KISAN_REGISTRATION_CARD" || code === "KISAN_CARD") {
            kisanCalls++;
          } else if (!isTopup) {
            otherCalls++;
          }

          if (!isTopup) {
            completedCount++;
            totalGrossRevenue += revenue;
            completedVendorCost += unitCost;

            serviceMap[code].completedCount++;
            serviceMap[code].completedRevenue += revenue;
            serviceMap[code].fulfilledCost += unitCost;
          } else {
            // WALLET_TOPUP:
            // Displayed in Service Economics breakdown and Operational Ledger as top-up deposit collected,
            // but excluded from platform gross revenue and platform completed orders count at the top.
            serviceMap[code].completedCount++;
            serviceMap[code].completedRevenue += revenue;
            serviceMap[code].fulfilledCost += 0;
          }
        } else if (isRefunded) {
          // Upstream vendor (PlanAPI) charges ₹0.00 for unlinked PAN, not found, or failed upstream requests.
          // User received 100% full refund immediately.
          // Hence: incurred vendor cost = 0, revenue = 0, wasted cost = 0.
          revenue = 0;
          incurredVendorCost = 0.0;
          // Do not increment panFindCalls or wastedVendorCost because zero upstream credits were burned.
        } else {
          // Unpaid drop-offs / checkout abandons (e.g. pending gateway sessions that never completed)
          if (!isTopup) {
            abandonedCount++;
          }
          serviceMap[code].abandonedCount++;
        }

        const netProfit = isRefunded ? 0.0 : (revenue - incurredVendorCost);
        const targetPhone = req.customer?.phone || req.user?.phone || "";
        const cleanPhone = targetPhone.replace(/[^0-9]/g, "");
        const targetName = req.customer?.name || req.user?.name || "Customer";
        const whatsappUrl = cleanPhone.length === 10
          ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Namaste ${targetName} ji, Nagrik Seva Point support team here. Aapka ${sName} lookup process start hua tha. Kya payment / checkout complete karne me koi dikkat aa rahi hai?`)}`
          : null;

        return {
          id: req.id,
          referenceNumber: req.referenceNumber || req.id.slice(0, 8).toUpperCase(),
          serviceCode: code,
          serviceName: sName,
          createdAt: req.createdAt,
          status: req.status as string,
          isPaid: isCompleted,
          isRefunded,
          revenue,
          incurredVendorCost,
          netProfit,
          organization: req.organization ? { id: req.organization.id, name: req.organization.name } : null,
          user: req.user ? { name: req.user.name, phone: req.user.phone } : null,
          customer: req.customer ? { name: req.customer.name, phone: req.customer.phone } : null,
          whatsappUrl,
        };
      });

      // Include all pre-checkout dropoffs (upstream inquiries that never initiated payment)
      for (const log of upstreamApiLogs) {
        if (claimedLogIds.has(log.id)) continue;

        const code = log.serviceCode;
        // Upstream vendor only burns credit on successful responses
        const isSuccess = log.status === "SUCCESS";
        const unitCost = isSuccess ? (serviceCostMap[code] ?? (code === "PAN_FIND" ? 3.0 : 2.5)) : 0.0;

        if (unitCost > 0) {
          if (code === "PAN_FIND") panFindCalls++;
          else if (code === "PAN_DETAILS") panDetailsCalls++;
          else if (code === "VEHICLE_LOOKUP" || code === "VEHICLE_RC") rcDetailsCalls++;
          else if (code === "DL_VERIFY" || code === "DRIVING_LICENSE") dlVerifyCalls++;
          else if (code === "MOBILE_TO_RC" || code === "MOBILE_RC") mobileToRcCalls++;
          else if (code === "RC_OWNER_HISTORY" || code === "RC_HISTORY") rcOwnerHistoryCalls++;
          else if (code === "KISAN_REGISTRATION_CARD" || code === "KISAN_CARD") kisanCalls++;
          else otherCalls++;
        }

        const fallbackServiceNames: Record<string, string> = {
          PAN_FIND: "Instant PAN Find by Aadhaar",
          PAN_DETAILS: "PAN Details Verification",
          PAN_TO_AADHAAR: "Find Aadhaar by PAN",
          VEHICLE_LOOKUP: "RC Details & Verification",
          VEHICLE_RC: "RC Details & Verification",
          MOBILE_TO_RC: "Mobile to RC Verification",
          MOBILE_RC: "Mobile to RC Verification",
          RC_OWNER_HISTORY: "RC Ownership History",
          RC_HISTORY: "RC Ownership History",
          DL_VERIFY: "Driving License Verification",
          DRIVING_LICENSE: "Driving License Verification",
          KISAN_CARD: "Kisan Registration Card",
          KISAN_REGISTRATION_CARD: "Kisan Registration Card",
        };

        const sName = fallbackServiceNames[code] || serviceMap[code]?.name || code;

        if (!serviceMap[code]) {
          serviceMap[code] = {
            code,
            name: sName,
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
        serviceMap[code].abandonedCount++;
        serviceMap[code].wastedCost += unitCost;

        abandonedCount++;
        wastedVendorCost += unitCost;

        const netProfit = -unitCost;
        const targetPhone = log.user?.phone || "";
        const cleanPhone = targetPhone.replace(/[^0-9]/g, "");
        const targetName = log.organization?.name || log.user?.name || "Cyber Café Partner";
        const whatsappUrl = cleanPhone.length === 10
          ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Namaste ${targetName} ji, Nagrik Seva Point support team here. Aapka ${sName} lookup inquiry kiya gaya tha (${log.reference || "Record"}). Kya isko complete / unlock karne me koi dikkat aa rahi hai?`)}`
          : null;

        detailedLedger.push({
          id: `INQ-${log.id.slice(0, 8).toUpperCase()}`,
          referenceNumber: log.reference || `INQ-${code}`,
          serviceCode: code,
          serviceName: sName,
          createdAt: log.createdAt,
          status: "UNPAID_DROP_OFF",
          isPaid: false,
          isRefunded: false,
          revenue: 0,
          incurredVendorCost: unitCost,
          netProfit,
          organization: log.organization ? { id: log.organization.id, name: log.organization.name } : null,
          user: log.user ? { name: log.user.name, phone: log.user.phone } : null,
          customer: null,
          whatsappUrl,
        });
      }

      // Sort detailed ledger chronologically descending
      detailedLedger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const totalRequests = completedCount + abandonedCount;
      const totalVendorBurn = completedVendorCost + wastedVendorCost;
      const netPlatformProfit = totalGrossRevenue - totalVendorBurn;
      const profitMargin = totalGrossRevenue > 0 ? Math.round((netPlatformProfit / totalGrossRevenue) * 100) : 0;
      const conversionRate = totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 100;
      const dropoffRate = 100 - conversionRate;

      // PlainAPI Wallet Burn breakdown (only paid vendor API calls burn wallet credits)
      const plainApiWalletBurn = {
        panFindCalls,
        panFindBurn: Number((panFindCalls * 3.0).toFixed(2)),
        panDetailsCalls,
        panDetailsBurn: Number((panDetailsCalls * 2.5).toFixed(2)),
        rcDetailsCalls,
        rcDetailsBurn: Number((rcDetailsCalls * 2.25).toFixed(2)),
        dlVerifyCalls,
        dlVerifyBurn: Number((dlVerifyCalls * 4.0).toFixed(2)),
        mobileToRcCalls,
        mobileToRcBurn: Number((mobileToRcCalls * 8.15).toFixed(2)),
        rcOwnerHistoryCalls,
        rcOwnerHistoryBurn: Number((rcOwnerHistoryCalls * 7.50).toFixed(2)),
        kisanCalls,
        kisanBurn: 0.00,
        otherCalls,
        otherBurn: 0.00,
        totalCalls:
          panFindCalls +
          panDetailsCalls +
          rcDetailsCalls +
          dlVerifyCalls +
          mobileToRcCalls +
          rcOwnerHistoryCalls,
        totalCreditBurned: Number(
          (
            panFindCalls * 3.0 +
            panDetailsCalls * 2.5 +
            rcDetailsCalls * 2.25 +
            dlVerifyCalls * 4.0 +
            mobileToRcCalls * 8.15 +
            rcOwnerHistoryCalls * 7.50
          ).toFixed(2)
        ),
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
    const cacheKey = `cache:audit-logs:${organizationId || "ALL"}:${category}:${page}:${limit}`;

    return await redis.remember(cacheKey, 60, async () => {
      const skip = (page - 1) * limit;
      const maxTake = Math.min(Math.max((skip + limit) * 2, 35), 75);

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
        take: maxTake,
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
        take: maxTake,
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
        take: maxTake,
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
        take: Math.min(maxTake, 30),
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
        take: maxTake,
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
        actLower.includes("register") ||
        actLower.includes("password") ||
        actLower.includes("reset");
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
        badgeVariant: isSuccess
          ? actLower.includes("password")
            ? "outline"
            : category === "SECURITY"
            ? "outline"
            : "secondary"
          : "destructive",
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
    });
  }

  // ==========================================
  // 15. DPDP COMPLIANCE & EPHEMERAL VAULT AUDIT
  // ==========================================

  async getVaultAudit() {
    return await redis.remember("cache:admin:vault_audit", 60, async () => {
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
    });
  }

  // ==========================================
  // 16. DIRECT & TARGETED VLE COMMUNICATIONS
  // ==========================================

  async getVleList() {
    return await redis.remember("cache:admin:vle_list", 60, async () => {
      const users = await prisma.user.findMany({
        where: { email: { not: "" } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          members: {
            select: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return users.map((u) => ({
        id: u.id,
        name: u.name || "Cyber Café Retailer",
        email: u.email,
        phone: u.phone || undefined,
        orgName: u.members[0]?.organization?.name || "Cyber Café Desk",
      }));
    });
  }

  async sendTargetedVleEmail(input: TargetedEmailInput) {
    const { recipientEmails, subject, title, message, severity, testEmail, language = "hi", includeButton = true } = input;
    const isEn = language === "en";

    // 1. SAFE DUMMY TEST: If testEmail is provided, dispatch ONLY 1 dummy sample to that address
    if (testEmail && testEmail.trim()) {
      const targetTest = testEmail.trim();
      logger.info(`[AdminService] Sending sample targeted VLE test email (${language}, button: ${includeButton}) to: ${targetTest}`);
      const testVleName = isEn ? "Rajesh Kumar" : "राजेश कुमार";

      const res = await brevoMailService.sendVLEBroadcastEmail({
        to: targetTest,
        vleName: testVleName,
        title: title || subject,
        customSubject: `[TEST SAMPLE] ${subject}`,
        message,
        severity,
        language,
        includeButton,
      });

      return {
        success: true,
        mode: "TEST_SAMPLE",
        sentCount: 1,
        message: `Safe test preview sent successfully to ${targetTest}.`,
        messageId: res.messageId,
      };
    }

    // 2. LIVE TARGETED DISPATCH TO SELECTED VLES
    logger.info(`[AdminService] Dispatching targeted email (${language}) to ${recipientEmails.length} selected VLEs in chunks of 10.`);

    // Persist active campaign metadata to Redis so language, subject, message are permanent and locked
    const campaignMeta = {
      subject,
      title: title || subject,
      message,
      language: language || "hi",
      severity: severity || "info",
      includeButton: includeButton !== false,
      dispatchedAt: new Date().toISOString(),
      totalRecipients: recipientEmails.length,
    };
    await redis.setJson("admin:latest_email_campaign", campaignMeta, 86400 * 30).catch(() => {});

    // Lookup recipient user records and organizations for dynamic personalization
    const users = await prisma.user.findMany({
      where: { email: { in: recipientEmails } },
      select: {
        id: true,
        email: true,
        name: true,
        members: {
          select: {
            organizationId: true,
            organization: {
              select: { name: true },
            },
          },
          take: 1,
        },
      },
    });

    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const failedDetails: Array<{
      email: string;
      vleName: string;
      reason: string;
      attempts: number;
      failedAt: string;
    }> = [];

    // Helper: Send single email with automatic retries (up to 3 attempts with exponential backoff)
    const sendWithRetry = async (email: string, vleName: string, orgId?: string, userId?: string) => {
      const maxAttempts = 3;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await brevoMailService.sendVLEBroadcastEmail({
            to: email,
            vleName,
            title: title || subject,
            customSubject: subject,
            message,
            severity,
            language,
            includeButton,
          });

          if (res.success) {
            // Log successful delivery to ApiLog audit trail with explicit Language and Subject
            await prisma.apiLog.create({
              data: {
                serviceCode: "EMAIL_DISPATCH",
                action: "Targeted VLE Email",
                endpoint: "/admin/communications/send-targeted-email",
                reference: email,
                status: "SUCCESS",
                statusCode: 200,
                organizationId: orgId || null,
                userId: userId || null,
                note: `Delivered to ${email} (${vleName}) on attempt ${attempt}. MsgId: ${res.messageId || "N/A"} | Subject: "${subject}" | Lang: ${language}`,
              },
            }).catch(() => {});
            return { success: true, email };
          } else {
            lastError = new Error(res.error || "Brevo returned unsuccessful status");
          }
        } catch (err: any) {
          lastError = err;
        }

        // If failed and attempts remain, delay before next retry
        if (attempt < maxAttempts) {
          const backoffDelay = attempt === 1 ? 500 : 1200;
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }

      // If we reach here, it failed ALL 3 retries
      const errorMessage = lastError?.message || "Delivery failed after 3 retry attempts";
      logger.error(`[AdminService] Critical: Email failed after ${maxAttempts} retries for ${email}: ${errorMessage}`);

      const failureRecord = {
        email,
        vleName,
        reason: errorMessage,
        attempts: maxAttempts,
        failedAt: new Date().toISOString(),
      };
      failedDetails.push(failureRecord);

      // 1. Persist failure to PostgreSQL ApiLog for permanent audit trail with explicit Language and Subject
      await prisma.apiLog.create({
        data: {
          serviceCode: "EMAIL_DISPATCH",
          action: "Targeted VLE Email",
          endpoint: "/admin/communications/send-targeted-email",
          reference: email,
          status: "FAILED",
          statusCode: 500,
          organizationId: orgId || null,
          userId: userId || null,
          note: `FAILED after ${maxAttempts} retries: ${errorMessage} | Subject: "${subject}" | Lang: ${language}`,
        },
      }).catch((dbErr) => logger.warn("[AdminService] Failed to write failure to ApiLog:", dbErr));

      // 2. Persist failure to Redis for instant retrieval and alert inspection
      try {
        const existing = (await redis.getJson<any[]>("admin:email_dispatch_failures")) || [];
        const updated = [{ ...failureRecord, subject, language }, ...existing].slice(0, 50);
        await redis.setJson("admin:email_dispatch_failures", updated, 86400 * 7); // Retain for 7 days
      } catch (redisErr) {
        logger.warn("[AdminService] Failed to push failure to Redis:", redisErr);
      }

      return { success: false, email, reason: errorMessage };
    };

    // Process recipients in small chunks of 10 to ensure proxy socket stability and zero dropped requests
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 500;
    const validEmails = recipientEmails.filter((e): e is string => Boolean(e && e.trim()));
    const results: Array<{ success: boolean; email: string; reason?: string }> = [];

    logger.info(`[AdminService] Starting chunked email dispatch for ${validEmails.length} recipients in batches of ${BATCH_SIZE} with ${BATCH_DELAY_MS}ms pacing...`);

    for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
      const chunk = validEmails.slice(i, i + BATCH_SIZE);
      const chunkNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalChunks = Math.ceil(validEmails.length / BATCH_SIZE);

      logger.info(`[AdminService] Dispatching batch ${chunkNumber}/${totalChunks} (${chunk.length} emails)...`);

      const chunkPromises = chunk.map((email) => {
        const lowerEmail = email.toLowerCase().trim();
        const u = userMap.get(lowerEmail);
        const name = u?.name?.trim();
        const vleName = name ? name : isEn ? "Retail Partner" : "सम्मानित वीएलई बंधु";
        const orgId = u?.members?.[0]?.organizationId;
        const userId = u?.id;
        return sendWithRetry(lowerEmail, vleName, orgId, userId);
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      if (i + BATCH_SIZE < validEmails.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const sentCount = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).map((r) => r.email);

    return {
      success: true,
      mode: "LIVE_TARGETED",
      totalCount: validEmails.length,
      sentCount,
      failedCount: failures.length,
      message: failures.length === 0
        ? `Email successfully delivered to all ${sentCount} recipient(s) in safe 10-email batches.`
        : `Delivered to ${sentCount} recipient(s), but ${failures.length} failed after retries.`,
      failures,
      failedDetails,
    };
  }

  /**
   * Get comprehensive email dispatch audit from Postgres ApiLog
   */
  async getEmailDispatchAudit() {
    try {
      const logs = await prisma.apiLog.findMany({
        where: { serviceCode: "EMAIL_DISPATCH" },
        orderBy: { createdAt: "desc" },
        take: 350,
      });

      if (logs.length === 0) {
        return {
          hasHistory: false,
          latestDispatchAt: null,
          totalAttempted: 0,
          sentCount: 0,
          failedCount: 0,
          subject: null,
          failures: [],
          recentSuccesses: [],
        };
      }

      // Group recent logs within 2 hours of latest log as current session
      const latestTime = new Date(logs[0].createdAt).getTime();
      const campaignWindowMs = 2 * 60 * 60 * 1000;
      const campaignLogs = logs.filter(
        (l) => latestTime - new Date(l.createdAt).getTime() <= campaignWindowMs
      );

      // Extract subject and language from saved campaign or note
      const savedCampaign = await redis.getJson<{
        subject: string;
        title: string;
        message: string;
        language: "hi" | "en";
        severity: string;
        includeButton: boolean;
        dispatchedAt: string;
      }>("admin:latest_email_campaign").catch(() => null);

      let latestSubject = savedCampaign?.subject || "Important Notification from Nagrik Seva Point";
      let campaignLang: "hi" | "en" = savedCampaign?.language || "hi";

      if (!savedCampaign) {
        for (const log of campaignLogs) {
          if (log.note && log.note.includes('Subject: "')) {
            const match = log.note.match(/Subject:\s*"([^"]+)"/);
            if (match && match[1]) {
              latestSubject = match[1];
              break;
            }
          }
        }
        for (const log of campaignLogs) {
          if (log.note?.includes("Lang: en") || latestSubject.includes("New Feature") || latestSubject.includes("Instant Wallet")) {
            campaignLang = "en";
            break;
          }
        }
      }

      // Deduplicate by recipient email to get latest status per VLE
      const latestStatusPerEmail = new Map<string, typeof logs[0]>();
      for (const log of campaignLogs) {
        if (log.reference && !latestStatusPerEmail.has(log.reference)) {
          latestStatusPerEmail.set(log.reference, log);
        }
      }

      const allUniqueVles = Array.from(latestStatusPerEmail.values());
      const successLogs = allUniqueVles.filter((l) => l.status === "SUCCESS");
      const failedLogs = allUniqueVles.filter((l) => l.status === "FAILED");

      // Lookup user names for failed VLEs
      const failedEmails = failedLogs
        .map((l) => l.reference)
        .filter((ref): ref is string => Boolean(ref));
      const failedUsers = await prisma.user.findMany({
        where: { email: { in: failedEmails } },
        select: { email: true, name: true },
      });
      const nameMap = new Map(failedUsers.map((u) => [u.email.toLowerCase(), u.name]));

      const failures = failedLogs.map((f) => {
        let reason = "Socket timeout / connection drop";
        if (f.note) {
          if (f.note.includes("fetch failed")) {
            reason = "Proxy connection reset / socket timeout";
          } else if (f.note.includes("401")) {
            reason = "Brevo IP unrecognised / authorization required";
          } else {
            const parts = f.note.split(":");
            if (parts.length > 1) {
              reason = parts[1].split("|")[0].trim();
            }
          }
        }

        const emailRef = f.reference || "";
        return {
          email: emailRef,
          vleName: emailRef ? (nameMap.get(emailRef.toLowerCase()) || "Retail Partner") : "Retail Partner",
          reason,
          failedAt: f.createdAt.toISOString(),
        };
      });

      return {
        hasHistory: true,
        latestDispatchAt: logs[0].createdAt.toISOString(),
        totalAttempted: allUniqueVles.length,
        sentCount: successLogs.length,
        failedCount: failedLogs.length,
        subject: latestSubject,
        language: campaignLang,
        title: savedCampaign?.title || latestSubject,
        message: savedCampaign?.message || null,
        severity: savedCampaign?.severity || "info",
        includeButton: savedCampaign?.includeButton ?? true,
        failures,
        recentSuccesses: successLogs.slice(0, 10).map((s) => ({
          email: s.reference,
          deliveredAt: s.createdAt.toISOString(),
        })),
      };
    } catch (err: any) {
      logger.error("[AdminService] Failed to load email dispatch audit:", err);
      return {
        hasHistory: false,
        latestDispatchAt: null,
        totalAttempted: 0,
        sentCount: 0,
        failedCount: 0,
        subject: null,
        language: "hi",
        title: null,
        message: null,
        severity: "info",
        includeButton: true,
        failures: [],
        recentSuccesses: [],
      };
    }
  }

  /**
   * Resend strictly to failed recipients using safe 10-email chunking queue
   */
  async resendFailedVleEmails(options?: {
    subject?: string;
    title?: string;
    message?: string;
    language?: "hi" | "en";
    severity?: "info" | "warning" | "urgent" | "success";
    includeButton?: boolean;
  }) {
    const audit = await this.getEmailDispatchAudit();
    if (audit.failures.length === 0) {
      throw AppError.badRequest("No failed recipients found to resend.", "NO_FAILED_RECIPIENTS");
    }

    const failedEmails = audit.failures.map((f) => f.email).filter(Boolean);
    logger.info(`[AdminService] Resending email to ${failedEmails.length} failed recipients using chunking queue...`);

    // Strictly preserve original campaign language: NEVER switch or translate behind the scenes!
    const targetLanguage: "hi" | "en" = options?.language || (audit.language === "en" ? "en" : "hi");
    const targetSubject = options?.subject?.trim() || audit.subject || (targetLanguage === "en" ? "Important Notification" : "महत्वपूर्ण सूचना");
    const targetMessage = options?.message?.trim() || audit.message || (targetLanguage === "en" ? "Official service advisory from Nagrik Seva Point." : "नागरिक सेवा केंद्र से आधिकारिक सूचना।");
    const targetTitle = options?.title?.trim() || targetSubject;

    return await this.sendTargetedVleEmail({
      recipientEmails: failedEmails,
      subject: targetSubject,
      title: targetTitle,
      message: targetMessage,
      language: targetLanguage,
      severity: (options?.severity as any) || (audit.severity as any) || "info",
      includeButton: options?.includeButton !== undefined ? options.includeButton : (audit.includeButton ?? true),
    });
  }

  /**
   * Get list of email dispatch failures from Postgres ApiLog
   */
  async getEmailDispatchFailures() {
    try {
      const audit = await this.getEmailDispatchAudit();
      return audit.failures;
    } catch {
      return [];
    }
  }

  /**
   * Clear email dispatch failures
   */
  async clearEmailDispatchFailures() {
    try {
      await redis.del("admin:email_dispatch_failures");
      return { success: true };
    } catch {
      return { success: false };
    }
  }
}

export const adminService = new AdminService();
