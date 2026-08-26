import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { requestService } from "./request.service";
import {
  type ConfirmRequestPaymentInput,
  confirmRequestPaymentSchema,
  type CreateRequestInput,
  createRequestSchema,
  type QueryRequestInput,
  queryRequestSchema,
} from "./request.schema";
import type { ContextVariables } from "../../app/context";

export const requestRoutes = new Hono<ContextVariables>();

// 1. Unified Initiate Service Request (Guest & Retailer)
requestRoutes.post(
  "/",
  validationMiddleware(createRequestSchema),
  async (c) => {
    const context = c.get("requestContext");
    const data = c.get("validData") as CreateRequestInput;

    const result = await requestService.createRequest(context, data);
    return c.json({ success: true, data: result });
  },
);


// 3. Get Request by ID (Scoped by context)
requestRoutes.get("/:id", async (c) => {
  const context = c.get("requestContext");
  const id = c.req.param("id");

  const result = await requestService.getRequestById(context, id);
  return c.json({ success: true, data: result });
});

// 4. Query Request History (Retailer only)
requestRoutes.get(
  "/",
  validationMiddleware(queryRequestSchema, "query"),
  async (c) => {
    const context = c.get("requestContext");
    const query = c.get("validData") as QueryRequestInput;

    const result = await requestService.queryRequests(context, query);
    return c.json({ success: true, ...result });
  },
);
