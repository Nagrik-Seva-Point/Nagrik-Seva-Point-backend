import { Hono } from "hono";
import type { ContextVariables } from "../../app/context";
import { requireAdmin } from "../../middleware/admin.middleware";
import { adminService } from "./admin.service";

export const adminRouter = new Hono<ContextVariables>();

// Protect all admin endpoints with strict requireAdmin middleware
adminRouter.use("*", requireAdmin());

/**
 * 1. KPI Overview Stats
 * GET /admin/stats/overview
 */
adminRouter.get("/stats/overview", async (c) => {
  const stats = await adminService.getOverviewStats();
  return c.json({ success: true, data: stats });
});

/**
 * 2. List Transactions with multi-filter debugger
 * GET /admin/transactions
 */
adminRouter.get("/transactions", async (c) => {
  const query = c.req.query();
  const result = await adminService.getTransactions({
    search: query.search,
    status: query.status,
    method: query.method,
    serviceCode: query.serviceCode,
    accessMode: query.accessMode,
    organizationId: query.organizationId,
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page ? parseInt(query.page, 10) : undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
  });

  return c.json({ success: true, data: result.items, pagination: result.pagination, summary: result.summary });
});

/**
 * 3. Get Single Transaction with complete debug audit & raw gateway payload
 * GET /admin/transactions/:id
 */
adminRouter.get("/transactions/:id", async (c) => {
  const id = c.req.param("id");
  const transaction = await adminService.getTransactionById(id);
  return c.json({ success: true, data: transaction });
});

/**
 * 4. List Organizations
 * GET /admin/organizations
 */
adminRouter.get("/organizations", async (c) => {
  const query = c.req.query();
  const result = await adminService.getOrganizations({
    search: query.search,
    page: query.page ? parseInt(query.page, 10) : undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
  });

  return c.json({ success: true, data: result.items, pagination: result.pagination, summary: result.summary });
});

/**
 * 5. Get Organization Details
 * GET /admin/organizations/:id
 */
adminRouter.get("/organizations/:id", async (c) => {
  const id = c.req.param("id");
  const org = await adminService.getOrganizationById(id);
  return c.json({ success: true, data: org });
});
