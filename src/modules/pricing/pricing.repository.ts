import { prisma } from "../../core/db/prisma";
import type { PricingTier } from "../../core/types/context.types";

export class PricingRepository {
  async findPrice(serviceId: string, pricingTier: PricingTier) {
    return await prisma.servicePrice.findUnique({
      where: {
        serviceId_pricingTier: {
          serviceId,
          pricingTier,
        },
      },
    });
  }

  async findPricesByServiceCode(serviceCode: string) {
    return await prisma.servicePrice.findMany({
      where: {
        service: {
          code: serviceCode,
        },
      },
      include: {
        service: true,
      },
    });
  }

  async upsertPrice(
    serviceId: string,
    pricingTier: PricingTier,
    amount: number,
    currency = "INR",
  ) {
    return await prisma.servicePrice.upsert({
      where: {
        serviceId_pricingTier: {
          serviceId,
          pricingTier,
        },
      },
      create: {
        serviceId,
        pricingTier,
        amount,
        currency,
      },
      update: {
        amount,
        currency,
      },
    });
  }
}

export const pricingRepository = new PricingRepository();
