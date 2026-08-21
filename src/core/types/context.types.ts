export type AccessMode = "GUEST" | "RETAILER";

export type PricingTier = "PUBLIC" | "PARTNER" | "PARTNER_GOLD" | "ENTERPRISE";

export interface RequestContext {
  accessMode: AccessMode;
  userId?: string | null;
  organizationId?: string | null;
  customerId?: string | null;
  pricingTier: PricingTier;
  guestSessionId?: string | null;
}
