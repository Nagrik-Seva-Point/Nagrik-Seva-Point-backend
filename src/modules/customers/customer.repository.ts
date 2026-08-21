import { prisma } from "../../core/db/prisma.ts";
import type { Prisma } from "@prisma/client";
import type {
  CreateCustomerInput,
  QueryCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema.ts";

export class CustomerRepository {
  async create(organizationId: string, data: CreateCustomerInput) {
    return await prisma.customer.create({
      data: {
        organizationId,
        name: data.name,
        phone: data.phone,
      },
    });
  }

  async update(id: string, organizationId: string, data: UpdateCustomerInput) {
    return await prisma.customer.update({
      where: {
        id,
        organizationId, // Tenant Isolation
      },
      data: {
        name: data.name ?? undefined,
        phone: data.phone,
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return await prisma.customer.findFirst({
      where: {
        id,
        organizationId, // Tenant Isolation
      },
    });
  }

  async findMany(organizationId: string, query: QueryCustomerInput) {
    const { search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {
      organizationId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async delete(id: string, organizationId: string) {
    return await prisma.customer.delete({
      where: {
        id,
        organizationId, // Tenant Isolation
      },
    });
  }
}

export const customerRepository = new CustomerRepository();
