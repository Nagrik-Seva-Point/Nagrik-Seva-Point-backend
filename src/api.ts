import { app } from "./app/app";

export const config = {
  runtime: "nodejs",
};

export default (req: Request) => {
  return app.fetch(req);
};
