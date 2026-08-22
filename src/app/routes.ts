import { Hono } from "hono";
import { authRoutes } from "../modules/auth/auth.routes.ts";
import { customerRoutes } from "../modules/customers/customer.routes.ts";
import {
  adminServiceRoutes,
  serviceRoutes,
} from "../modules/services/service.routes.ts";
import {
  adminCategoryRouter,
  categoryRouter,
} from "../modules/categories/category.routes.ts";
import { requestRoutes } from "../modules/requests/request.routes.ts";
import { panRoutes } from "../modules/pan/pan.routes.ts";
import { requestContextMiddleware } from "../middleware/request-context.middleware.ts";
import type { ContextVariables } from "./context.ts";

export const apiRouter = new Hono<ContextVariables>();

// Resolve dynamic RequestContext (Guest vs Retailer) for all API endpoints
apiRouter.use("*", requestContextMiddleware());

// Core Domain API Routes
apiRouter.route("/auth", authRoutes);
apiRouter.route("/customers", customerRoutes);
apiRouter.route("/categories", categoryRouter);
apiRouter.route("/services", serviceRoutes);
apiRouter.route("/service-requests", requestRoutes);

// Specialized Service Routes
apiRouter.route("/pan", panRoutes);
apiRouter.route("/integrations/pan", panRoutes);

// Master Admin API Routes
apiRouter.route("/admin/categories", adminCategoryRouter);
apiRouter.route("/admin/services", adminServiceRoutes);
