import { handle } from "hono/vercel";
import { app } from "./app/app";

export const config = {
  runtime: "nodejs",
};

export default handle(app);
