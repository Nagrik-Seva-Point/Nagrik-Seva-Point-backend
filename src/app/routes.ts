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

// Specialized Service Routes
apiRouter.route("/pan", panRoutes);
apiRouter.route("/integrations/pan", panRoutes);

// Master Admin API Routes
apiRouter.route("/admin/categories", adminCategoryRouter);
apiRouter.route("/admin/services", adminServiceRoutes);
apiRouter.route("/admin", adminRouter);
