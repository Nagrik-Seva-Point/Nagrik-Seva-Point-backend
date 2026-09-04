import { serviceRepository } from "./service.repository";
import { prisma } from "../../core/db/prisma";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import type {
  CreateServiceInput,
  QueryServiceInput,
  UpdateServiceInput,
} from "./service.schema";
import type { RequestContext } from "../../core/types/context.types";
import type { PricingTier } from "@prisma/client";

export class ServiceService {
  /**
   * Helper to resolve category ID from input (supports UUID or code string)
   */
  private async resolveCategoryId(
    categoryIdOrCode?: string,
  ): Promise<string | null> {
    if (!categoryIdOrCode) {
      const defaultCat = await prisma.serviceCategory.findFirst({
        where: { code: "IDENTITY_TAX" },
      });
      return defaultCat?.id || null;
    }

    // Try finding by ID
    const byId = await prisma.serviceCategory.findUnique({
      where: { id: categoryIdOrCode },
    });
    if (byId) return byId.id;

    // Try finding by Code
    const byCode = await prisma.serviceCategory.findUnique({
      where: { code: categoryIdOrCode.toUpperCase() },
    });
    if (byCode) return byCode.id;

    // Fallback to default
    const defaultCat = await prisma.serviceCategory.findFirst({
      where: { code: "IDENTITY_TAX" },
    });
    return defaultCat?.id || null;
  }

  /**
   * Public & Retailer contextual catalog listing
   */
  async getServices(context: RequestContext, query: QueryServiceInput) {
    const isGuest = context.accessMode === "GUEST";
    const services = await serviceRepository.findMany(query, isGuest);

    return services.map((service) => {
      // Extract all tier price snapshots
      const publicPriceRecord = service.prices.find((p) =>
        p.pricingTier === "PUBLIC"
      );
      const partnerPriceRecord = service.prices.find((p) =>
        p.pricingTier === "PARTNER"
      );
      const goldPriceRecord = service.prices.find((p) =>
        p.pricingTier === "PARTNER_GOLD"
      );
      const enterprisePriceRecord = service.prices.find((p) =>
        p.pricingTier === "ENTERPRISE"
      );

      const publicPrice = publicPriceRecord
        ? Number(publicPriceRecord.amount)
        : 40.0;
      const partnerPrice = partnerPriceRecord
        ? Number(partnerPriceRecord.amount)
        : 25.0;

      // Find matching price for caller's tier, fallback to PARTNER or default
      const matchedPrice = service.prices.find((p) =>
        p.pricingTier === context.pricingTier
      ) ||
        (context.accessMode === "GUEST"
          ? publicPriceRecord
          : partnerPriceRecord) ||
        partnerPriceRecord ||
        publicPriceRecord;

      const defaultAmount = context.accessMode === "GUEST"
        ? publicPrice
        : partnerPrice;

      return {
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        category: service.category
          ? {
            id: service.category.id,
            code: service.category.code,
            name: service.category.name,
          }
          : null,
        isActive: service.isActive,
        requiresCustomer: service.requiresCustomer,
        publicPrice,
        partnerPrice,
        pricing: {
          amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
          currency: matchedPrice ? matchedPrice.currency : "INR",
          tier: context.pricingTier,
        },
      };
    });
  }

  /**
   * Get single service detail projected with caller's tier price
   */
  async getServiceByCode(code: string, context?: RequestContext) {
    const normalizedCode = code.toUpperCase();
    const service = await serviceRepository.findByCode(normalizedCode);
    const isKisanService = normalizedCode === "KISAN_REGISTRATION_CARD" || normalizedCode === "KISAN_CARD";

    if (context && context.accessMode === "GUEST" && !service.isPublicAllowed) {
      if (isKisanService) {
        await prisma.service.update({
          where: { id: service.id },
          data: { isPublicAllowed: true },
        }).catch(() => {});
      } else {
        throw AppError.forbidden("This service requires retailer authentication");
      }
    }

    if (
      context &&
      context.accessMode === "RETAILER" &&
      !service.isRetailerAllowed
    ) {
      throw AppError.forbidden(
        "This service is not enabled for retailer workspace",
      );
    }

    const publicPriceRecord = service.prices.find((p) =>
      p.pricingTier === "PUBLIC"
    );
    const partnerPriceRecord = service.prices.find((p) =>
      p.pricingTier === "PARTNER"
    );

    const publicPrice = publicPriceRecord
      ? Number(publicPriceRecord.amount)
      : 20.0;
    const partnerPrice = partnerPriceRecord
      ? Number(partnerPriceRecord.amount)
      : 15.0;

    const tier = context?.pricingTier || "PARTNER";
    const matchedPrice = service.prices.find((p) => p.pricingTier === tier) ||
      (context?.accessMode === "GUEST"
        ? publicPriceRecord
        : partnerPriceRecord) ||
      partnerPriceRecord ||
      publicPriceRecord;

    const defaultAmount = context?.accessMode === "GUEST"
      ? publicPrice
      : partnerPrice;

    return {
      id: service.id,
      code: service.code,
      name: service.name,
      description: service.description,
      category: service.category
        ? {
          id: service.category.id,
          code: service.category.code,
          name: service.category.name,
        }
        : null,
      isActive: service.isActive,
      isPublicAllowed: service.isPublicAllowed || isKisanService,
      isRetailerAllowed: service.isRetailerAllowed,
      requiresCustomer: service.requiresCustomer,
      publicPrice,
      partnerPrice,
      pricing: {
        amount: matchedPrice ? Number(matchedPrice.amount) : defaultAmount,
        currency: matchedPrice ? matchedPrice.currency : "INR",
        tier,
      },
    };
  }

  // --- MASTER ADMIN METHODS ---

  /**
   * List all services with all tier prices for Master Admin
   */
  async getAllAdminServices() {
    const services = await prisma.service.findMany({
      include: {
        prices: true,
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return services.map((s) => {
      const publicP = s.prices.find((p) => p.pricingTier === "PUBLIC");
      const partnerP = s.prices.find((p) => p.pricingTier === "PARTNER");
      const goldP = s.prices.find((p) => p.pricingTier === "PARTNER_GOLD");
      const enterpriseP = s.prices.find((p) => p.pricingTier === "ENTERPRISE");

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        categoryId: s.categoryId,
        category: s.category
          ? {
            id: s.category.id,
            code: s.category.code,
            name: s.category.name,
          }
          : null,
        isActive: s.isActive,
        isPublicAllowed: s.isPublicAllowed,
        isRetailerAllowed: s.isRetailerAllowed,
        requiresCustomer: s.requiresCustomer,
        requiresUpload: s.requiresUpload,
        producesDocument: s.producesDocument,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        prices: {
          public: publicP ? Number(publicP.amount) : 40.0,
          partner: partnerP ? Number(partnerP.amount) : 25.0,
          partnerGold: goldP ? Number(goldP.amount) : null,
          enterprise: enterpriseP ? Number(enterpriseP.amount) : null,
        },
      };
    });
  }

  /**
   * Master Admin: Create a new service and seed its multi-tier prices
   */
  async createService(input: CreateServiceInput) {
    const normalizedCode = input.code.toUpperCase().trim();

    // Check code uniqueness
    const existing = await prisma.service.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw AppError.badRequest(
        `Service with code ${normalizedCode} already exists.`,
        "SERVICE_CODE_EXISTS",
      );
    }

    const resolvedCatId = await this.resolveCategoryId(
      input.categoryId || input.category,
    );

    const service = await prisma.$transaction(async (tx) => {
      const newService = await tx.service.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          categoryId: resolvedCatId,
          isActive: input.isActive ?? true,
          isPublicAllowed: input.isPublicAllowed ?? true,
          isRetailerAllowed: input.isRetailerAllowed ?? true,
          requiresCustomer: input.requiresCustomer ?? false,
          requiresUpload: input.requiresUpload ?? false,
          producesDocument: input.producesDocument ?? false,
        },
      });

      // Seed Prices
      const priceTiers: Array<{ pricingTier: PricingTier; amount: number }> = [
        { pricingTier: "PUBLIC", amount: input.publicPrice ?? 40.0 },
        { pricingTier: "PARTNER", amount: input.partnerPrice ?? 25.0 },
      ];

      if (input.partnerGoldPrice !== undefined) {
        priceTiers.push({
          pricingTier: "PARTNER_GOLD",
          amount: input.partnerGoldPrice,
        });
      }
      if (input.enterprisePrice !== undefined) {
        priceTiers.push({
          pricingTier: "ENTERPRISE",
          amount: input.enterprisePrice,
        });
      }

      for (const p of priceTiers) {
        await tx.servicePrice.create({
          data: {
            serviceId: newService.id,
            pricingTier: p.pricingTier,
            amount: p.amount,
            currency: "INR",
          },
        });
      }

      return newService;
    });

    logger.info(`Admin created new service: ${service.code} (${service.name})`);
    return await this.getServiceByCode(service.code);
  }

  /**
   * Master Admin: Update service metadata, category, capability flags, and prices
   */
  async updateService(id: string, input: UpdateServiceInput) {
    const existing = await prisma.service.findUnique({
      where: { id },
      include: { prices: true },
    });

    if (!existing) {
      throw AppError.notFound(`Service with ID ${id} not found`);
    }

    let resolvedCatId: string | null | undefined = undefined;
    if (input.categoryId !== undefined || input.category !== undefined) {
      resolvedCatId = await this.resolveCategoryId(
        input.categoryId || input.category,
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update Service fields
      await tx.service.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          description: input.description !== undefined
            ? input.description?.trim() || null
            : undefined,
          categoryId: resolvedCatId !== undefined ? resolvedCatId : undefined,
          isActive: input.isActive,
          isPublicAllowed: input.isPublicAllowed,
          isRetailerAllowed: input.isRetailerAllowed,
          requiresCustomer: input.requiresCustomer,
          requiresUpload: input.requiresUpload,
          producesDocument: input.producesDocument,
        },
      });

      // 2. Update Prices if provided
      if (input.publicPrice !== undefined) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PUBLIC",
            },
          },
          update: { amount: input.publicPrice },
          create: {
            serviceId: id,
            pricingTier: "PUBLIC",
            amount: input.publicPrice,
            currency: "INR",
          },
        });
      }

      if (input.partnerPrice !== undefined) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PARTNER",
            },
          },
          update: { amount: input.partnerPrice },
          create: {
            serviceId: id,
            pricingTier: "PARTNER",
            amount: input.partnerPrice,
            currency: "INR",
          },
        });
      }

      if (input.partnerGoldPrice !== undefined) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "PARTNER_GOLD",
            },
          },
          update: { amount: input.partnerGoldPrice },
          create: {
            serviceId: id,
            pricingTier: "PARTNER_GOLD",
            amount: input.partnerGoldPrice,
            currency: "INR",
          },
        });
      }

      if (input.enterprisePrice !== undefined) {
        await tx.servicePrice.upsert({
          where: {
            serviceId_pricingTier: {
              serviceId: id,
              pricingTier: "ENTERPRISE",
            },
          },
          update: { amount: input.enterprisePrice },
          create: {
            serviceId: id,
            pricingTier: "ENTERPRISE",
            amount: input.enterprisePrice,
            currency: "INR",
          },
        });
      }
    });

    logger.info(`Admin updated service: ${existing.code}`);
    return await this.getServiceByCode(existing.code);
  }

  /**
   * Master Admin: Permanent deletion of a service from the database
   */
  async deleteService(id: string) {
    const existing = await prisma.service.findUnique({
      where: { id },
    });

    if (!existing) {
      throw AppError.notFound(`Service with ID ${id} not found`);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete associated requests and their child events/payments
      const requests = await tx.serviceRequest.findMany({
        where: { serviceId: id },
        select: { id: true },
      });

      const requestIds = requests.map((r) => r.id);

      if (requestIds.length > 0) {
        await tx.serviceRequestEvent.deleteMany({
          where: { serviceRequestId: { in: requestIds } },
        });
        await tx.payment.deleteMany({
          where: { serviceRequestId: { in: requestIds } },
        });
        await tx.serviceRequest.deleteMany({
          where: { serviceId: id },
        });
      }

      // 2. Delete all price tiers for this service
      await tx.servicePrice.deleteMany({
        where: { serviceId: id },
      });

      // 3. Permanently delete the service record from DB
      await tx.service.delete({
        where: { id },
      });
    });

    logger.info(
      `Admin permanently deleted service: ${existing.code} (ID: ${id})`,
    );
    return {
      success: true,
      message: `Service ${existing.code} has been permanently deleted.`,
    };
  }
}

export const serviceService = new ServiceService();
