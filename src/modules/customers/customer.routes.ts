import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware";
import { organizationMiddleware } from "../../middleware/organization.middleware";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { customerService } from "./customer.service";
import {
  type CreateCustomerInput,
  createCustomerSchema,
  type QueryCustomerInput,
  queryCustomerSchema,
  type UpdateCustomerInput,
  updateCustomerSchema,
} from "./customer.schema";
import type { ContextVariables } from "../../app/context";

export const customerRoutes = new Hono<ContextVariables>();

// Apply Auth and Tenant Isolation Middleware to all Customer routes
customerRoutes.use("*", authMiddleware());
customerRoutes.use("*", organizationMiddleware());

customerRoutes.post(
  "/",
  validationMiddleware(createCustomerSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const data = c.get("validData") as CreateCustomerInput;
    const customer = await customerService.createCustomer(organizationId, data);
    return c.json({ success: true, data: customer }, 201);
  },
);

customerRoutes.get(
  "/",
  validationMiddleware(queryCustomerSchema, "query"),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const query = c.get("validData") as QueryCustomerInput;
    const result = await customerService.queryCustomers(organizationId, query);
    return c.json({ success: true, ...result });
  },
);

customerRoutes.get("/:id", async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");
  const customer = await customerService.getCustomerById(id, organizationId);
  return c.json({ success: true, data: customer });
});

customerRoutes.patch(
  "/:id",
  validationMiddleware(updateCustomerSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const id = c.req.param("id");
    const data = c.get("validData") as UpdateCustomerInput;
    const customer = await customerService.updateCustomer(
      id,
      organizationId,
      data,
    );
    return c.json({ success: true, data: customer });
  },
);

customerRoutes.delete("/:id", async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");
  await customerService.deleteCustomer(id, organizationId);
  return c.json({ success: true, message: "Customer deleted successfully" });
});
