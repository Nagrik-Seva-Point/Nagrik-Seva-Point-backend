import { Hono } from "hono";
import { authRoutes } from "../modules/auth/auth.routes.ts";
import { customerRoutes } from "../modules/customers/customer.routes.ts";
import { serviceRoutes } from "../modules/services/service.routes.ts";
import { requestRoutes } from "../modules/requests/request.routes.ts";
import { requestContextMiddleware } from "../middleware/request-context.middleware.ts";
import type { ContextVariables } from "./context.ts";

export const apiRouter = new Hono<ContextVariables>();

// Resolve dynamic RequestContext (Guest vs Retailer) for all API endpoints
apiRouter.use("*", requestContextMiddleware());

apiRouter.route("/auth", authRoutes);
apiRouter.route("/customers", customerRoutes);
apiRouter.route("/services", serviceRoutes);
apiRouter.route("/service-requests", requestRoutes);
