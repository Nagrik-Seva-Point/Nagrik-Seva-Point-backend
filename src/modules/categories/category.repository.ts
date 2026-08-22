import { prisma } from "../../core/db/prisma.ts";
import type { Prisma } from "@prisma/client";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.schema.ts";

export class CategoryRepository {
  async findMany(isActive?: boolean) {
    const where: Prisma.ServiceCategoryWhereInput = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return await prisma.serviceCategory.findMany({
      where,
      include: {
        _count: {
          select: { services: true },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  }

  async findById(id: string) {
    return await prisma.serviceCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { services: true },
        },
      },
    });
  }

  async findByCode(code: string) {
    return await prisma.serviceCategory.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        _count: {
          select: { services: true },
        },
      },
    });
  }

  async create(data: CreateCategoryInput) {
    return await prisma.serviceCategory.create({
      data: {
        code: data.code.toUpperCase().trim(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        icon: data.icon?.trim() || null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateCategoryInput) {
    return await prisma.serviceCategory.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description !== undefined
          ? data.description?.trim() || null
          : undefined,
        icon: data.icon !== undefined ? data.icon?.trim() || null : undefined,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
    });
  }

  async delete(id: string) {
    return await prisma.serviceCategory.delete({
      where: { id },
    });
  }
}

export const categoryRepository = new CategoryRepository();
