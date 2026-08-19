import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.middleware.ts";
import { organizationMiddleware } from "../../middleware/organization.middleware.ts";
import { validationMiddleware } from "../../middleware/validation.middleware.ts";
import { requestService } from "./request.service.ts";
import {
  type CreateRequestInput,
  createRequestSchema,
  type QueryRequestInput,
  queryRequestSchema,
} from "./request.schema.ts";
import type { ContextVariables } from "../../app/context.ts";

export const requestRoutes = new Hono<ContextVariables>();

// Apply Auth and Tenant Isolation middlewares to all Request endpoints
requestRoutes.use("*", authMiddleware());
requestRoutes.use("*", organizationMiddleware());

requestRoutes.post("/", validationMiddleware(createRequestSchema), async (c) => {
  const organizationId = c.get("organizationId")!;
  const data = c.get("validData") as CreateRequestInput;

  // 1. Create the request DB record
  const request = await requestService.createRequest(organizationId, data);

  // 2. If it was already completed (e.g. matched an existing idempotency key), return it
  if (request.status === "SUCCESS" || request.status === "FAILED") {
    return c.json({ success: true, data: request });
  }

  // 3. Process the integration workflow
  const result = await requestService.processRequest(request.id, organizationId);
  return c.json({ success: true, data: result });
});

requestRoutes.get("/", validationMiddleware(queryRequestSchema, "query"), async (c) => {
  const organizationId = c.get("organizationId")!;
  const query = c.get("validData") as QueryRequestInput;

  const result = await requestService.queryRequests(organizationId, query);
  return c.json({ success: true, ...result });
});

requestRoutes.get("/:id", async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const result = await requestService.getRequestById(id, organizationId);
  return c.json({ success: true, data: result });
});
