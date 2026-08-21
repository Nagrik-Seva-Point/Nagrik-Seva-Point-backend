import { Hono } from "hono";
import { serviceService } from "./service.service.ts";
import { pricingService } from "../pricing/pricing.service.ts";
import {
  type QueryServiceInput,
  queryServiceSchema,
} from "./service.schema.ts";
import { validationMiddleware } from "../../middleware/validation.middleware.ts";
import type { ContextVariables } from "../../app/context.ts";

export const serviceRoutes = new Hono<ContextVariables>();

// Public & Retailer Service Catalog
serviceRoutes.get(
  "/",
  validationMiddleware(queryServiceSchema, "query"),
  async (c) => {
    const query = c.get("validData") as QueryServiceInput;
    const context = c.get("requestContext");

    const services = await serviceService.getServices(context, query);
    return c.json({ success: true, data: services });
  },
);

serviceRoutes.get("/:code", async (c) => {
  const code = c.req.param("code");
  const context = c.get("requestContext");

  const service = await serviceService.getServiceByCode(code, context);
  return c.json({ success: true, data: service });
});

serviceRoutes.get("/:code/pricing", async (c) => {
  const code = c.req.param("code");
  const pricingMatrix = await pricingService.getPricingMatrix(code);
  return c.json({ success: true, data: pricingMatrix });
});
