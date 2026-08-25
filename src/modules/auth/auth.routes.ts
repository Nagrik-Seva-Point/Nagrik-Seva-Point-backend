import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { authService } from "./auth.service";
import {
  type CheckAvailabilityInput,
  checkAvailabilitySchema,
  type RegisterRetailerInput,
  registerRetailerSchema,
  type LoginInput,
  loginSchema,
} from "./auth.schema";
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

// 4. Current Authenticated Profile & Org Metadata
authRoutes.get("/me", async (c) => {
  const context = c.get("requestContext");
  const user = c.get("user");
  const organization = c.get("organization");

  return c.json({
    success: true,
    data: {
      accessMode: context.accessMode,
      pricingTier: context.pricingTier,
      user: user || null,
      organization: organization || null,
    },
  });
});
