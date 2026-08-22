import { prisma } from "../../core/db/prisma.ts";
import type { Prisma } from "@prisma/client";
import type { QueryServiceInput } from "./service.schema.ts";

export class ServiceRepository {
  async findMany(query: QueryServiceInput, isGuest = false) {
    const { categoryId, categoryCode } = query;
    const where: Prisma.ServiceWhereInput = {};

    if (categoryId) {
      where.categoryId = categoryId;
    } else if (categoryCode) {
      where.category = { code: categoryCode.toUpperCase() };
    }

    // Explicit AccessMode visibility enforcement
    if (isGuest) {
      where.isPublicAllowed = true;
    } else {
      where.isRetailerAllowed = true;
    }

    return await prisma.service.findMany({
      where,
      include: {
        prices: true,
        category: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async findByCode(code: string) {
    return await prisma.service.findUnique({
      where: { code },
      include: {
        prices: true,
        category: true,
      },
    });
  }

  async upsert(
    code: string,
    data: {
      name: string;
      description?: string;
      categoryId?: string | null;
      isActive?: boolean;
      isPublicAllowed?: boolean;
      isRetailerAllowed?: boolean;
      requiresCustomer?: boolean;
      requiresUpload?: boolean;
      producesDocument?: boolean;
    },
  ) {
    return await prisma.service.upsert({
      where: { code },
      update: {
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        isRetailerAllowed: data.isRetailerAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false,
      },
      create: {
        code,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        isRetailerAllowed: data.isRetailerAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false,
      },
      include: {
        prices: true,
        category: true,
      },
    });
  }
}

export const serviceRepository = new ServiceRepository();
