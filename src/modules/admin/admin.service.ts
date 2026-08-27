import { prisma } from "../../core/db/prisma";
import { AppError } from "../../core/errors/AppError";
import type { PaymentStatus, PaymentMethod, UserRole, AccessMode, RequestStatus } from "@prisma/client";

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

    const where: any = {};

    // Status filter
    if (query.status && query.status !== "ALL") {
      where.status = query.status.toUpperCase() as PaymentStatus;
    }

    // Payment Method filter
    if (query.method && query.method !== "ALL") {
      where.method = query.method.toUpperCase() as PaymentMethod;
    }

    // Organization filter
    if (query.organizationId && query.organizationId !== "ALL") {
      where.organizationId = query.organizationId;
    }

    // Date range filter
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        // End of the selected day
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Service Code or Access Mode filter on ServiceRequest relation
    const serviceRequestConditions: any = {};
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

    // Search query: matches across multiple key fields for rapid debugging
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
   * 2. Get Single Transaction with complete debug audit & raw gateway response
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
   * 3. List all Organizations with stats, owners, and balances
   */
  async getOrganizations(query: OrganizationFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
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
                },
              },
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

    return {
      items,
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
   * 5. Master Admin KPI Overview Stats
   */
  async getOverviewStats() {
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
  }
}

export const adminService = new AdminService();
