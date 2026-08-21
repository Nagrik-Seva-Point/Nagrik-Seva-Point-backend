import { prisma } from "../../core/db/prisma.ts";
import type { Prisma } from "@prisma/client";
import type { QueryServiceInput } from "./service.schema.ts";

export class ServiceRepository {
  async findMany(query: QueryServiceInput, isGuest = false) {
    const { category } = query;
    const where: Prisma.ServiceWhereInput = {
      isActive: true,
    };
    if (category) {
      where.category = category;
    }
    if (isGuest) {
      where.isPublicAllowed = true;
    }

    return await prisma.service.findMany({
      where,
      include: {
        prices: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async findByCode(code: string) {
    return await prisma.service.findUnique({
      where: { code },
      include: {
        prices: true,
      },
    });
  }

  async upsert(
    code: string,
    data: {
      name: string;
      description?: string;
      category: string;
      isActive?: boolean;
      isPublicAllowed?: boolean;
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
        category: data.category,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false,
      },
      create: {
        code,
        name: data.name,
        description: data.description,
        category: data.category,
        isActive: data.isActive ?? true,
        isPublicAllowed: data.isPublicAllowed ?? true,
        requiresCustomer: data.requiresCustomer ?? false,
        requiresUpload: data.requiresUpload ?? false,
        producesDocument: data.producesDocument ?? false,
      },
    });
  }
}

export const serviceRepository = new ServiceRepository();
