import { app } from "../src/app/app";

// vercel-deno expects a default export of a function that takes a Request and returns a Response
export default (req: Request) => {
  return app.fetch(req);
};
