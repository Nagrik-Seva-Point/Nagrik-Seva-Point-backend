import { customerRepository } from "./customer.repository.ts";
import { AppError } from "../../core/errors/AppError.ts";
import type {
  CreateCustomerInput,
  QueryCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema.ts";

export class CustomerService {
  async createCustomer(organizationId: string, data: CreateCustomerInput) {
    return await customerRepository.create(organizationId, data);
  }

  async updateCustomer(
    id: string,
    organizationId: string,
    data: UpdateCustomerInput,
  ) {
    // Confirm customer exists and belongs to the org first
    await this.getCustomerById(id, organizationId);
    return await customerRepository.update(id, organizationId, data);
  }

  async getCustomerById(id: string, organizationId: string) {
    const customer = await customerRepository.findById(id, organizationId);
    if (!customer) {
      throw AppError.notFound(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async queryCustomers(organizationId: string, query: QueryCustomerInput) {
    return await customerRepository.findMany(organizationId, query);
  }

  async deleteCustomer(id: string, organizationId: string) {
    // Confirm customer exists and belongs to the org first
    await this.getCustomerById(id, organizationId);
    return await customerRepository.delete(id, organizationId);
  }
}

export const customerService = new CustomerService();
