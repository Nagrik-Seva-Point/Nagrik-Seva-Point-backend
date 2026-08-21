import type { Organization } from "@prisma/client";
import type { auth } from "../core/auth/better-auth.ts";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface HonoVariables {
  requestId: string;
  user?: AuthSession["user"];
  session?: AuthSession["session"];
  organizationId?: string;
  organization?: Organization;
  validData?: unknown;
}

export type ContextVariables = {
  Variables: HonoVariables;
};
