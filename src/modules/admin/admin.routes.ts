import { Hono } from "hono";
import type { ContextVariables } from "../../app/context";
import { requireAdmin } from "../../middleware/admin.middleware";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { adminService } from "./admin.service";
import {
  walletAdjustmentSchema,
  type WalletAdjustmentInput,
  disputeManualOverrideSchema,
  type DisputeManualOverrideInput,
  maintenanceToggleSchema,
  type MaintenanceToggleInput,
  announcementSchema,
  type AnnouncementInput,
  orgStatusSchema,
  type OrgStatusInput,
  tierPriceUpdateSchema,
  type TierPriceUpdateInput,
} from "./admin.schema";

export const adminRouter = new Hono<ContextVariables>();

// Public/Retailer non-admin read endpoint for active platform announcements
adminRouter.get("/public/announcement", async (c) => {
  const data = await adminService.getAnnouncement();
  return c.json({ success: true, data });
});

// Protect all remaining admin endpoints with strict requireAdmin middleware
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
 * 3. Get Single Transaction
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
 * 5. Retailer Churn Radar (Must precede :id wildcard)
 * GET /admin/organizations/churn-radar
 */
adminRouter.get("/organizations/churn-radar", async (c) => {
  const data = await adminService.getChurnRadar();
  return c.json({ success: true, data });
});

adminRouter.get("/churn-radar", async (c) => {
  const data = await adminService.getChurnRadar();
  return c.json({ success: true, data });
});

/**
 * 6. Get Organization Details
 * GET /admin/organizations/:id
 */
adminRouter.get("/organizations/:id", async (c) => {
  const id = c.req.param("id");
  const org = await adminService.getOrganizationById(id);
  return c.json({ success: true, data: org });
});

/**
 * 6. Dispute & Exception Desk ("Paisa Kat Gaya" Resolver)
 * GET /admin/disputes/hanging
 */
adminRouter.get("/disputes/hanging", async (c) => {
  const items = await adminService.getHangingRequests();
  return c.json({ success: true, data: items, count: items.length });
});

/**
 * Retry fulfillment for a dispute
 * POST /admin/disputes/:id/retry
 */
adminRouter.post("/disputes/:id/retry", async (c) => {
  const id = c.req.param("id");
  const result = await adminService.retryDispute(id);
  return c.json(result);
});

/**
 * Manual Override with Result Data
 * POST /admin/disputes/:id/manual-override
 */
adminRouter.post(
  "/disputes/:id/manual-override",
  validationMiddleware(disputeManualOverrideSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.get("validData") as DisputeManualOverrideInput;
    const result = await adminService.manualOverrideDispute(id, data.resultData, data.note);
    return c.json(result);
  }
);

/**
 * 7. Upstream Vendor Health & Credits
 * GET /admin/vendor/health
 */
adminRouter.get("/vendor/health", async (c) => {
  const health = await adminService.getVendorHealth();
  return c.json({ success: true, data: health });
});

/**
 * 8. Service Kill-Switches & Maintenance Mode
 * GET /admin/system/maintenance
 * POST /admin/system/maintenance
 */
adminRouter.get("/system/maintenance", async (c) => {
  const status = await adminService.getMaintenanceStatus();
  return c.json({ success: true, data: status });
});

adminRouter.post(
  "/system/maintenance",
  validationMiddleware(maintenanceToggleSchema),
  async (c) => {
    const data = c.get("validData") as MaintenanceToggleInput;
    const result = await adminService.setMaintenanceStatus(data);
    return c.json(result);
  }
);

/**
 * 9. In-App Broadcast Notice Board
 * GET /admin/system/announcement
 * POST /admin/system/announcement
 */
adminRouter.get("/system/announcement", async (c) => {
  const data = await adminService.getAnnouncement();
  return c.json({ success: true, data });
});

adminRouter.post(
  "/system/announcement",
  validationMiddleware(announcementSchema),
  async (c) => {
    const data = c.get("validData") as AnnouncementInput;
    const result = await adminService.setAnnouncement(data);
    return c.json(result);
  }
);

/**
 * 10. Manual Wallet Credit/Debit Adjustment
 * POST /admin/organizations/:id/wallet/adjust
 */
adminRouter.post(
  "/organizations/:id/wallet/adjust",
  validationMiddleware(walletAdjustmentSchema),
  async (c) => {
    const orgId = c.req.param("id");
    const data = c.get("validData") as WalletAdjustmentInput;
    const result = await adminService.adjustOrganizationWallet(orgId, data);
    return c.json(result);
  }
);

/**
 * Ledger Reconciliation
 * GET /admin/ledger/reconciliation
 */
adminRouter.get("/ledger/reconciliation", async (c) => {
  const data = await adminService.getLedgerReconciliation();
  return c.json({ success: true, data });
});

/**
 * 11. Dynamic Multi-Tier Pricing Matrix
 * GET /admin/pricing/matrix
 * POST /admin/pricing/tier-update
 */
adminRouter.get("/pricing/matrix", async (c) => {
  const data = await adminService.getPricingMatrix();
  return c.json({ success: true, data });
});

adminRouter.post(
  "/pricing/tier-update",
  validationMiddleware(tierPriceUpdateSchema),
  async (c) => {
    const data = c.get("validData") as TierPriceUpdateInput;
    const result = await adminService.updateTierPrice(data);
    return c.json(result);
  }
);

/**
 * 12. Retailer Status Update
 * POST /admin/organizations/:id/status
 */

adminRouter.post(
  "/organizations/:id/status",
  validationMiddleware(orgStatusSchema),
  async (c) => {
    const orgId = c.req.param("id");
    const data = c.get("validData") as OrgStatusInput;
    const result = await adminService.setOrganizationStatus(orgId, data);
    return c.json(result);
  }
);

/**
 * 13. Financial Leakage & Drop-Off Tracking
 * GET /admin/analytics/leakage
 */
adminRouter.get("/analytics/leakage", async (c) => {
  const timeRange = (c.req.query("timeRange") || "30DAYS") as "TODAY" | "YESTERDAY" | "7DAYS" | "30DAYS" | "ALL";
  const data = await adminService.getFinancialLeakage(timeRange);
  return c.json({ success: true, data });
});

/**
 * 14. Organization Milestone Timeline
 * GET /admin/organizations/:id/milestones
 */
adminRouter.get("/organizations/:id/milestones", async (c) => {
  const orgId = c.req.param("id");
  const data = await adminService.getOrganizationMilestones(orgId);
  return c.json({ success: true, data });
});

/**
 * 15. DPDP Ephemeral Vault Audit
 * GET /admin/system/vault-audit
 */
adminRouter.get("/system/vault-audit", async (c) => {
  const data = await adminService.getVaultAudit();
  return c.json({ success: true, data });
});

/**
 * 16. System & Organization Audit Logs
 * GET /admin/audit-logs
 */
adminRouter.get("/audit-logs", async (c) => {
  const query = {
    organizationId: c.req.query("organizationId") || undefined,
    category: (c.req.query("category") || "ALL") as "ALL" | "WALLET" | "SERVICE" | "MILESTONE" | "SECURITY",
    page: Number(c.req.query("page")) || 1,
    limit: Number(c.req.query("limit")) || 30,
  };
  const data = await adminService.getAuditLogs(query);
  return c.json({ success: true, data });
});

