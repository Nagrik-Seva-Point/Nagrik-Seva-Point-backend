import { customerRepository } from "./customer.repository";
import { redis } from "../../core/redis/redis.client";
import { AppError } from "../../core/errors/AppError";
import type {
  CreateCustomerInput,
  QueryCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema";

export class CustomerService {
  async createCustomer(organizationId: string, data: CreateCustomerInput) {
    const customer = await customerRepository.create(organizationId, data);
    redis.delPattern(`cache:customers:${organizationId}:*`).catch(() => {});
    return customer;
  }

  async updateCustomer(
    id: string,
    organizationId: string,
    data: UpdateCustomerInput,
  ) {
    // Confirm customer exists and belongs to the org first
    await this.getCustomerById(id, organizationId);
    const updated = await customerRepository.update(id, organizationId, data);
    redis.delPattern(`cache:customers:${organizationId}:*`).catch(() => {});
    return updated;
  }

  async getCustomerById(id: string, organizationId: string) {
    const customer = await customerRepository.findById(id, organizationId);
    if (!customer) {
      throw AppError.notFound(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async queryCustomers(organizationId: string, query: QueryCustomerInput) {
    const cacheKey = `cache:customers:${organizationId}:${query.page || 1}:${query.limit || 20}:${query.search || "ALL"}`;
    return await redis.remember(cacheKey, 15, async () => {
      return await customerRepository.findMany(organizationId, query);
    });
  }

  async deleteCustomer(id: string, organizationId: string) {
    // Confirm customer exists and belongs to the org first
    await this.getCustomerById(id, organizationId);
    const deleted = await customerRepository.delete(id, organizationId);
    redis.delPattern(`cache:customers:${organizationId}:*`).catch(() => {});
    return deleted;
  }
}

export const customerService = new CustomerService();
