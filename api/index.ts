import { handle } from "hono/vercel";
import { app } from "../src/app/app.ts";

export const config = {
  runtime: "nodejs",
};

export default handle(app);
