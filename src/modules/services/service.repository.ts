import { prisma } from "../../core/db/prisma.ts";
import type { QueryServiceInput } from "./service.schema.ts";

export class ServiceRepository {
  async findMany(query: QueryServiceInput) {
    const { category } = query;
    const where: any = {
      isActive: true,
    };
    if (category) {
      where.category = category;
    }
    return await prisma.service.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async findByCode(code: string) {
    return await prisma.service.findUnique({
      where: { code },
    });
  }

  async upsert(
    code: string,
    data: {
      name: string;
      description?: string;
      category: string;
      isActive?: boolean;
    },
  ) {
    return await prisma.service.upsert({
      where: { code },
      update: {
        name: data.name,
        description: data.description,
        category: data.category,
        isActive: data.isActive ?? true,
      },
      create: {
        code,
        name: data.name,
        description: data.description,
        category: data.category,
        isActive: data.isActive ?? true,
      },
    });
  }
}

export const serviceRepository = new ServiceRepository();
