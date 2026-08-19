import { handle } from "hono/vercel";
import { app } from "../src/app/app.ts";

export default handle(app);
