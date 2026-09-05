import { pricingRepository } from "./pricing.repository";
import { redis } from "../../core/redis/redis.client";
import { AppError } from "../../core/errors/AppError";
import type { PricingTier } from "../../core/types/context.types";

export interface PriceSnapshot {
  amount: number;
  currency: string;
  pricingTier: PricingTier;
}

export class PricingService {
  /**
   * Calculates the authoritative server-side price snapshot for a given service and tier.
   * Client-supplied prices are strictly ignored. (Cached with Redis 3600s TTL)
   */
  async calculatePrice(
    serviceId: string,
    pricingTier: PricingTier,
  ): Promise<PriceSnapshot> {
    const cacheKey = `cache:pricing:tier:${serviceId}:${pricingTier}`;

    return await redis.remember(cacheKey, 3600, async () => {
      const priceRecord = await pricingRepository.findPrice(
        serviceId,
        pricingTier,
      );

      if (!priceRecord) {
        // Fallback to PARTNER tier if PARTNER_GOLD/ENTERPRISE requested but not set
        if (pricingTier === "PARTNER_GOLD" || pricingTier === "ENTERPRISE") {
          const partnerFallback = await pricingRepository.findPrice(
            serviceId,
            "PARTNER",
          );
          if (partnerFallback) {
            return {
              amount: Number(partnerFallback.amount),
              currency: partnerFallback.currency,
              pricingTier: "PARTNER",
            };
          }
        }

        // Default safe fallback if database price record is missing during onboarding
        const defaultAmount = pricingTier === "PUBLIC" ? 40.00 : 25.00;
        return {
          amount: defaultAmount,
          currency: "INR",
          pricingTier,
        };
      }

      return {
        amount: Number(priceRecord.amount),
        currency: priceRecord.currency,
        pricingTier: priceRecord.pricingTier,
      };
    });
  }

  /**
   * Retrieves full pricing matrix for a service (Cached with Redis 3600s TTL)
   */
  async getPricingMatrix(serviceCode: string) {
    const normalizedCode = serviceCode.toUpperCase();
    const cacheKey = `cache:pricing:matrix:${normalizedCode}`;

    return await redis.remember(cacheKey, 3600, async () => {
      const prices = await pricingRepository.findPricesByServiceCode(normalizedCode);
      if (!prices || prices.length === 0) {
        throw AppError.notFound(
          `No pricing configured for service code: ${normalizedCode}`,
        );
      }
      return prices.map((p) => ({
        tier: p.pricingTier,
        amount: Number(p.amount),
        currency: p.currency,
      }));
    });
  }
}

export const pricingService = new PricingService();
