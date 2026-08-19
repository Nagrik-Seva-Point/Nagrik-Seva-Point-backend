import { Hono } from "hono";
import { customerRoutes } from "../modules/customers/customer.routes.ts";
import { serviceRoutes } from "../modules/services/service.routes.ts";
import { requestRoutes } from "../modules/requests/request.routes.ts";
import type { ContextVariables } from "./context.ts";

export const apiRouter = new Hono<ContextVariables>();

apiRouter.route("/customers", customerRoutes);
apiRouter.route("/services", serviceRoutes);
apiRouter.route("/service-requests", requestRoutes);
