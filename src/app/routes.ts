import { Hono } from "hono";
import { authRoutes } from "../modules/auth/auth.routes";
import { customerRoutes } from "../modules/customers/customer.routes";
import {
  adminServiceRoutes,
  serviceRoutes,
} from "../modules/services/service.routes";
import {
  adminCategoryRouter,
  categoryRouter,
} from "../modules/categories/category.routes";
import { requestRoutes } from "../modules/requests/request.routes";
import { panRoutes } from "../modules/pan/pan.routes";
import { paymentRoutes } from "../modules/payment/payment.routes";
import { adminRouter } from "../modules/admin/admin.routes";
import { adminService } from "../modules/admin/admin.service";
import { AppError } from "../core/errors/AppError";
import { requestContextMiddleware } from "../middleware/request-context.middleware";
import type { ContextVariables } from "./context";

export const apiRouter = new Hono<ContextVariables>();

// Resolve dynamic RequestContext (Guest vs Retailer) for all API endpoints
apiRouter.use("*", requestContextMiddleware());

// Core Domain API Routes
apiRouter.route("/auth", authRoutes);
apiRouter.route("/customers", customerRoutes);
apiRouter.route("/categories", categoryRouter);
apiRouter.route("/services", serviceRoutes);
apiRouter.route("/service-requests", requestRoutes);
apiRouter.route("/requests", requestRoutes);
apiRouter.route("/payments", paymentRoutes);

// Retailer & Cyber Café Audit Log History (Tenant-Isolated)
apiRouter.get("/audit-logs", async (c) => {
  const user = c.get("user");
  if (!user) {
    throw AppError.unauthorized("Authentication required to view audit logs");
  }

  const rawRole = (user as { role?: string }).role;
  const isAdmin = rawRole === "ADMIN" || rawRole === "SUPER_ADMIN";
  const userOrgId = c.get("organizationId");
  const query = c.req.query();

  const targetOrgId = isAdmin ? (query.organizationId || userOrgId) : userOrgId;

  if (!isAdmin && !targetOrgId) {
    return c.json({
      success: true,
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 30,
        totalPages: 1,
        summary: {
          totalEvents: 0,
          walletEvents: 0,
          serviceEvents: 0,
          milestoneEvents: 0,
          securityEvents: 0,
          totalAdjustedVolume: 0,
        },
      },
    });
  }

  const data = await adminService.getAuditLogs({
    organizationId: targetOrgId || undefined,
    category: (query.category as "ALL" | "WALLET" | "SERVICE" | "MILESTONE" | "SECURITY") || "ALL",
    page: query.page ? parseInt(query.page, 10) : 1,
    limit: query.limit ? parseInt(query.limit, 10) : 30,
  });

  return c.json({ success: true, data });
});

// Specialized Service Routes
apiRouter.route("/pan", panRoutes);
apiRouter.route("/integrations/pan", panRoutes);

// Master Admin API Routes
apiRouter.route("/admin/categories", adminCategoryRouter);
apiRouter.route("/admin/services", adminServiceRoutes);
apiRouter.route("/admin", adminRouter);
