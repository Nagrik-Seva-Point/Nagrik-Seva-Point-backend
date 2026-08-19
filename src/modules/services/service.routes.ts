import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware.ts";
import { organizationMiddleware } from "../../middleware/organization.middleware.ts";
import { validationMiddleware } from "../../middleware/validation.middleware.ts";
import { serviceService } from "./service.service.ts";
import {
  type QueryServiceInput,
  queryServiceSchema,
} from "./service.schema.ts";
import type { ContextVariables } from "../../app/context.ts";

export const serviceRoutes = new Hono<ContextVariables>();

// Protect catalogue endpoints behind tenant check
serviceRoutes.use("*", authMiddleware());
serviceRoutes.use("*", organizationMiddleware());

serviceRoutes.get(
  "/",
  validationMiddleware(queryServiceSchema, "query"),
  async (c) => {
    const query = c.get("validData") as QueryServiceInput;
    const services = await serviceService.getActiveServices(query);
    return c.json({ success: true, data: services });
  },
);

serviceRoutes.get("/:code", async (c) => {
  const code = c.req.param("code");
  const service = await serviceService.getServiceByCode(code);
  return c.json({ success: true, data: service });
});
