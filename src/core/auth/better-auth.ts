import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db/prisma.ts";
import { bearer, organization } from "better-auth/plugins";

import { env } from "../config/env.ts";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization(), // Standard configuration
    bearer(), // Enables Authorization: Bearer <token> parsing
  ],
});
type Auth = typeof auth;
export type { Auth };
