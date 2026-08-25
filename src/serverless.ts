import { getRequestListener } from "@hono/node-server";
import { app } from "./app/app";

export const config = {
  runtime: "nodejs",
};

export default getRequestListener(app.fetch);
