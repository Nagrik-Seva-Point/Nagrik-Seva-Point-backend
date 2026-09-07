import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { authService } from "./auth.service";
import {
  type CheckAvailabilityInput,
  checkAvailabilitySchema,
  type LoginInput,
  loginSchema,
  type RegisterRetailerInput,
  registerRetailerSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from "./auth.schema";
import { AppError } from "../../core/errors/AppError";
import type { ContextVariables } from "../../app/context";

export const authRoutes = new Hono<ContextVariables>();

// 1. Pre-validation API for email and phone availability
authRoutes.post(
  "/check-availability",
  validationMiddleware(checkAvailabilitySchema),
  async (c) => {
    const data = c.get("validData") as CheckAvailabilityInput;
    const result = await authService.checkAvailability(data);
    return c.json({ success: true, ...result });
  },
);

// 2. Partner / Cyber Café Registration with automatic Org & Wallet creation
authRoutes.post(
  "/register",
  validationMiddleware(registerRetailerSchema),
  async (c) => {
    const data = c.get("validData") as RegisterRetailerInput;
    const result = await authService.registerRetailer(data, c.req.raw.headers);
    return c.json({ success: true, data: result }, 201);
  },
);

// 3. Smart Login via Email OR 10-Digit Phone + Password
authRoutes.post(
  "/login",
  validationMiddleware(loginSchema),
  async (c) => {
    const data = c.get("validData") as LoginInput;
    const result = await authService.login(data, c.req.raw.headers);
    return c.json({ success: true, data: result });
  },
);

// 4. Current Authenticated Profile & Cyber Café Org Metadata
authRoutes.get("/me", async (c) => {
  const context = c.get("requestContext");
  const user = c.get("user");
  const orgId = c.get("organizationId");

  if (!user) {
    return c.json({
      success: true,
      data: {
        accessMode: context.accessMode,
        pricingTier: context.pricingTier,
        user: null,
        organization: null,
      },
    });
  }

  const profile = await authService.getProfile(user.id, orgId || null);

  return c.json({
    success: true,
    data: {
      accessMode: context.accessMode,
      pricingTier: context.pricingTier,
      user: profile.user,
      organization: profile.organization,
    },
  });
});

// 5. Update Profile & Cyber Café details
authRoutes.patch(
  "/profile",
  validationMiddleware(updateProfileSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      throw AppError.unauthorized("Authentication required to update profile");
    }
    const orgId = c.get("organizationId");
    const data = c.get("validData") as UpdateProfileInput;

    const updated = await authService.updateProfile(
      user.id,
      orgId || null,
      data,
    );

    return c.json({
      success: true,
      message: "Profile updated successfully",
      data: updated,
    });
  },
);

