import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { panService } from "./pan.service";
import {
  type FindPanInput,
  findPanSchema,
  type PanDetailsInput,
  panDetailsSchema,
} from "./pan.schema";
import type { ContextVariables } from "../../app/context";

export const panRoutes = new Hono<ContextVariables>();

/**
 * 1. Find PAN Number by Aadhaar
 * POST /pan/find
 */
panRoutes.post(
  "/find",
  validationMiddleware(findPanSchema),
  async (c) => {
    const { aadhaar } = c.get("validData") as FindPanInput;
    const result = await panService.findPanByAadhaar(aadhaar);
    return c.json({ success: true, data: result });
  },
);

/**
 * 2. Get Comprehensive PAN Details
 * POST /pan/details
 */
panRoutes.post(
  "/details",
  validationMiddleware(panDetailsSchema),
  async (c) => {
    const { pan } = c.get("validData") as PanDetailsInput;
    const result = await panService.getPanDetails(pan);
    return c.json({ success: true, data: result });
  },
);
