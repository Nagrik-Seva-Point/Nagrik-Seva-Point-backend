import { prisma } from "../../core/db/prisma";
import type { Prisma, RequestStatus } from "@prisma/client";
import type { QueryRequestInput } from "./request.schema";
import type { RequestContext } from "../../core/types/context.types";
import { ephemeralVault } from "../../core/vault/ephemeral-vault.service";

const retailerPaymentSelect = {
  id: true,
  serviceRequestId: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  orderId: true,
  transactionId: true,
  paymentMode: true,
  errorMessage: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
};

export class RequestRepository {
  async findById(id: string) {
    return await prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        service: true,
        customer: true,
        user: true,
        organization: true,
        events: {
          orderBy: { createdAt: "asc" },
        },
        payments: {
          select: retailerPaymentSelect,
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async findByIdempotencyKey(key: string) {
    return await prisma.serviceRequest.findUnique({
      where: { idempotencyKey: key },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true,
      },
    });
  }

  async create(data: {
    referenceNumber: string;
    serviceId: string;
    context: RequestContext;
    customerId?: string | null;
    amount: number;
    currency: string;
    inputData: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    return await prisma.serviceRequest.create({
      data: {
        referenceNumber: data.referenceNumber,
        serviceId: data.serviceId,
        accessMode: data.context.accessMode,
        pricingTier: data.context.pricingTier,
        userId: data.context.userId || null,
        organizationId: data.context.organizationId || null,
        customerId: data.customerId || null,
        guestSessionId: data.context.guestSessionId || null,
        amount: data.amount,
        currency: data.currency,
        status: "REQUEST_CREATED",
        inputData: data.inputData as Prisma.InputJsonValue,
        idempotencyKey: data.idempotencyKey || null,
        events: {
          create: {
            status: "REQUEST_CREATED",
            note: "Service request initiated and price locked",
          },
        },
      },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true,
      },
    });
  }

  async updateStatus(id: string, status: RequestStatus, note?: string) {
    const isTerminal = status === "COMPLETED" || status === "PROVIDER_FAILED" ||
      status === "FAILED";

    return await prisma.serviceRequest.update({
      where: { id },
      data: {
        status,
        completedAt: isTerminal ? new Date() : undefined,
        events: {
          create: {
            status,
            note: note || undefined,
          },
        },
      },
      include: {
        service: true,
        customer: true,
        events: true,
        payments: true,
      },
    });
  }

  async updateResult(
    id: string,
    resultData: Record<string, unknown>,
    providerId?: string,
    providerReference?: string,
  ) {
    return await prisma.serviceRequest.update({
      where: { id },
      data: {
        resultData: resultData as Prisma.InputJsonValue,
        providerId: providerId || undefined,
        providerReference: providerReference || undefined,
      },
    });
  }

  async findMany(organizationId: string, query: QueryRequestInput) {
    const { page, limit, status, serviceCode, customerId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceRequestWhereInput = {
      organizationId,
    };

    if (status) {
      where.status = status;
    }
    if (serviceCode) {
      where.service = { code: serviceCode };
    }
    if (customerId) {
      where.customerId = customerId;
    }

    const [items, total, statusGroups] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          service: true,
          customer: true,
          user: true,
          payments: {
            select: retailerPaymentSelect,
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);

    const statusCounts = statusGroups.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    const completedCount = (statusCounts["COMPLETED"] || 0) + (statusCounts["SUCCESS"] || 0);
    const pendingCount =
      (statusCounts["REQUEST_CREATED"] || 0) +
      (statusCounts["PRICE_LOCKED"] || 0) +
      (statusCounts["PAYMENT_PENDING"] || 0) +
      (statusCounts["PAYMENT_CAPTURED"] || 0) +
      (statusCounts["PROCESSING"] || 0);
    const failedCount =
      (statusCounts["PROVIDER_FAILED"] || 0) +
      (statusCounts["FAILED"] || 0) +
      (statusCounts["CANCELLED"] || 0) +
      (statusCounts["REFUNDED"] || 0);

    const hydratedItems = await Promise.all(
      items.map(async (item) => {
        if (item.status === "COMPLETED") {
          const vault = await ephemeralVault.getVaultItem(item.id);
          return {
            ...item,
            vaultData: vault.data,
            vaultInfo: {
              isExpired: vault.isExpired,
              remainingTtlSeconds: vault.remainingTtlSeconds,
              expiresAt: vault.expiresAt,
            },
          };
        }
        return {
          ...item,
          vaultData: null,
          vaultInfo: {
            isExpired: true,
            remainingTtlSeconds: 0,
            expiresAt: null,
          },
        };
      }),
    );

    return {
      items: hydratedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      summary: {
        total,
        completed: completedCount,
        pending: pendingCount,
        failed: failedCount,
      },
    };
  }
}

export const requestRepository = new RequestRepository();
