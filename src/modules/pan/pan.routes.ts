import { Hono } from "hono";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { panService } from "./pan.service";
import {
  type DecryptPanTokenInput,
  decryptPanTokenSchema,
  type FindPanInput,
  findPanSchema,
  type PanDetailsInput,
  panDetailsSchema,
  type VerifyPanDetailsInput,
  verifyPanDetailsSchema,
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
    const validData = c.get("validData") as PanDetailsInput;
    const result = await panService.getPanDetails(validData);
    return c.json({ success: true, data: result });
  },
);

/**
 * 3. Decrypt Search Token & Reveal PAN + Masked Aadhaar
 * POST /pan/decrypt-token
 */
panRoutes.post(
  "/decrypt-token",
  validationMiddleware(decryptPanTokenSchema),
  async (c) => {
    const { searchToken } = c.get("validData") as DecryptPanTokenInput;
    const result = panService.decryptSearchToken(searchToken);
    return c.json({ success: true, data: result });
  },
);

/**
 * 4. Verify PAN Details & Tokenize (Pre-Payment Availability Check)
 * POST /pan/details/verify
 */
panRoutes.post(
  "/details/verify",
  validationMiddleware(verifyPanDetailsSchema),
  async (c) => {
    const { pan } = c.get("validData") as VerifyPanDetailsInput;
    const result = await panService.verifyPanDetails(pan);
    return c.json({ success: true, data: result });
  },
);

/**
 * 5. Decrypt Details Token to Reveal Full Demographic Records
 * POST /pan/details/decrypt
 */
panRoutes.post(
  "/details/decrypt",
  validationMiddleware(decryptPanTokenSchema),
  async (c) => {
    const { searchToken } = c.get("validData") as DecryptPanTokenInput;
    const result = panService.decryptPanDetailsToken(searchToken);
    return c.json({ success: true, data: result });
  },
);
