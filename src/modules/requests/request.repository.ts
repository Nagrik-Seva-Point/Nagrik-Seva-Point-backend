import { prisma } from "../../core/db/prisma.ts";
import type { CreateRequestInput, QueryRequestInput } from "./request.schema.ts";

export class RequestRepository {
  async create(organizationId: string, serviceId: string, customerId: string, data: CreateRequestInput) {
    const request = await prisma.serviceRequest.create({
      data: {
        organizationId,
        serviceId,
        customerId,
        status: "CREATED",
        inputData: data.inputData,
        idempotencyKey: data.idempotencyKey || null,
      },
    });
    await this.addEvent(request.id, "CREATED");
    return request;
  }

  async findById(id: string, organizationId: string) {
    return await prisma.serviceRequest.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        service: true,
        customer: true,
        events: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async findByIdempotencyKey(idempotencyKey: string, organizationId: string) {
    return await prisma.serviceRequest.findFirst({
      where: {
        idempotencyKey,
        organizationId,
      },
      include: {
        service: true,
        customer: true,
      },
    });
  }

  async findMany(organizationId: string, query: QueryRequestInput) {
    const { customerId, status, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
    };

    if (customerId) {
      where.customerId = customerId;
    }
    if (status) {
      where.status = status;
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
        },
      }),
      prisma.serviceRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateStatus(id: string, organizationId: string, status: "CREATED" | "PROCESSING" | "SUCCESS" | "FAILED") {
    return await prisma.serviceRequest.update({
      where: {
        id,
        organizationId,
      },
      data: {
        status,
      },
    });
  }

  async updateResult(id: string, organizationId: string, resultData: any, referenceNumber?: string) {
    return await prisma.serviceRequest.update({
      where: {
        id,
        organizationId,
      },
      data: {
        resultData: resultData || null,
        referenceNumber: referenceNumber || null,
      },
    });
  }

  async addEvent(serviceRequestId: string, status: "CREATED" | "PROCESSING" | "SUCCESS" | "FAILED") {
    return await prisma.serviceRequestEvent.create({
      data: {
        serviceRequestId,
        status,
      },
    });
  }
}

export const requestRepository = new RequestRepository();
