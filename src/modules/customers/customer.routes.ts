import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware";
import { organizationMiddleware } from "../../middleware/organization.middleware";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { customerService } from "./customer.service";
import { logApiExecution } from "../../core/logger/api-logger";
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
    const user = c.get("user");
    const data = c.get("validData") as CreateCustomerInput;
    const customer = await customerService.createCustomer(organizationId, data);

    await logApiExecution({
      organizationId,
      userId: user?.id || null,
      serviceCode: "CUSTOMER",
      action: "Customer Profile Created",
      endpoint: "/api/v1/customers",
      reference: customer.phone || customer.name,
      status: "SUCCESS",
      statusCode: 201,
      ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
      note: `Added new citizen customer: ${customer.name} (${customer.phone})`,
    });

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
    const user = c.get("user");
    const id = c.req.param("id");
    const data = c.get("validData") as UpdateCustomerInput;
    const customer = await customerService.updateCustomer(
      id,
      organizationId,
      data,
    );

    await logApiExecution({
      organizationId,
      userId: user?.id || null,
      serviceCode: "CUSTOMER",
      action: "Customer Profile Updated",
      endpoint: `/api/v1/customers/${id}`,
      reference: customer.phone || customer.name,
      status: "SUCCESS",
      statusCode: 200,
      ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
      note: `Updated citizen record for ${customer.name} (${customer.phone})`,
    });

    return c.json({ success: true, data: customer });
  },
);

customerRoutes.delete("/:id", async (c) => {
  const organizationId = c.get("organizationId")!;
  const user = c.get("user");
  const id = c.req.param("id");
  await customerService.deleteCustomer(id, organizationId);

  await logApiExecution({
    organizationId,
    userId: user?.id || null,
    serviceCode: "CUSTOMER",
    action: "Customer Record Deleted",
    endpoint: `/api/v1/customers/${id}`,
    reference: id.slice(0, 8),
    status: "SUCCESS",
    statusCode: 200,
    ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
    note: `Deleted customer record ID: ${id}`,
  });

  return c.json({ success: true, message: "Customer deleted successfully" });
});
