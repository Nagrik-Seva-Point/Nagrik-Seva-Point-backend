import { prisma } from "../../core/db/prisma";
import type { Prisma, RequestStatus } from "@prisma/client";
import type { QueryRequestInput } from "./request.schema";
import type { RequestContext } from "../../core/types/context.types";

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

    const [items, total] = await Promise.all([
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
            orderBy: { createdAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.serviceRequest.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const requestRepository = new RequestRepository();
