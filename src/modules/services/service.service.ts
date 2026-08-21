import { serviceRepository } from "./service.repository.ts";
import { AppError } from "../../core/errors/AppError.ts";
import type { QueryServiceInput } from "./service.schema.ts";
import type { RequestContext } from "../../core/types/context.types.ts";

export class ServiceService {
  async getServices(context: RequestContext, query: QueryServiceInput) {
    const isGuest = context.accessMode === "GUEST";
    const services = await serviceRepository.findMany(query, isGuest);

    return services.map((service) => {
      // Find matching price for caller's tier, fallback to PARTNER or default
      const matchedPrice =
        service.prices.find((p) => p.pricingTier === context.pricingTier) ||
        service.prices.find((p) => p.pricingTier === "PUBLIC") ||
        service.prices.find((p) => p.pricingTier === "PARTNER");

      const defaultAmount = context.accessMode === "GUEST" ? 40.00 : 25.00;

      return {
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        category: service.category,
        isActive: service.isActive,
        isPublicAllowed: service.isPublicAllowed,
        requiresCustomer: service.requiresCustomer,
        requiresUpload: service.requiresUpload,
        producesDocument: service.producesDocument,
        pricing: {
          amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
          currency: matchedPrice ? matchedPrice.currency : "INR",
          tier: context.pricingTier,
        },
      };
    });
  }

  async getServiceByCode(code: string, context?: RequestContext) {
    const service = await serviceRepository.findByCode(code);
    if (!service) {
      throw AppError.notFound(`Service with code ${code} not found`);
    }

    if (context && context.accessMode === "GUEST" && !service.isPublicAllowed) {
      throw AppError.forbidden("This service requires retailer authentication");
    }

    const tier = context?.pricingTier || "PARTNER";
    const matchedPrice =
      service.prices.find((p) => p.pricingTier === tier) ||
      service.prices.find((p) => p.pricingTier === "PUBLIC") ||
      service.prices.find((p) => p.pricingTier === "PARTNER");

    const defaultAmount = context?.accessMode === "GUEST" ? 40.00 : 25.00;

    return {
      id: service.id,
      code: service.code,
      name: service.name,
      description: service.description,
      category: service.category,
      isActive: service.isActive,
      isPublicAllowed: service.isPublicAllowed,
      requiresCustomer: service.requiresCustomer,
      requiresUpload: service.requiresUpload,
      producesDocument: service.producesDocument,
      pricing: {
        amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
        currency: matchedPrice ? matchedPrice.currency : "INR",
        tier,
      },
    };
  }
}

export const serviceService = new ServiceService();
