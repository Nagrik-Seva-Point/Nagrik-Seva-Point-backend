import { Hono } from "hono";
import { serviceService } from "./service.service";
import { pricingService } from "../pricing/pricing.service";
import {
  type CreateServiceInput,
  createServiceSchema,
  type QueryServiceInput,
  queryServiceSchema,
  type UpdateServiceInput,
  updateServiceSchema,
} from "./service.schema";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { requireAdmin } from "../../middleware/admin.middleware";
import type { ContextVariables } from "../../app/context";

export const serviceRoutes = new Hono<ContextVariables>();

// ==========================================
// 1. PUBLIC & RETAILER SERVICE CATALOG ROUTES
// ==========================================

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

// ==========================================
// 2. MASTER ADMIN SERVICE MANAGEMENT ROUTES
// ==========================================

export const adminServiceRoutes = new Hono<ContextVariables>();

// Enforce admin privileges on all admin routes
adminServiceRoutes.use("*", requireAdmin());

adminServiceRoutes.get("/", async (c) => {
  const services = await serviceService.getAllAdminServices();
  return c.json({ success: true, data: services });
});

adminServiceRoutes.post(
  "/",
  validationMiddleware(createServiceSchema),
  async (c) => {
    const data = c.get("validData") as CreateServiceInput;
    const result = await serviceService.createService(data);
    return c.json({ success: true, data: result }, 201);
  },
);

adminServiceRoutes.put(
  "/:id",
  validationMiddleware(updateServiceSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.get("validData") as UpdateServiceInput;
    const result = await serviceService.updateService(id, data);
    return c.json({ success: true, data: result });
  },
);

adminServiceRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await serviceService.deleteService(id);
  return c.json(result);
});
