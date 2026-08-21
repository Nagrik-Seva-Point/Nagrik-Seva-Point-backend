import type { Organization } from "@prisma/client";
import type { auth } from "../core/auth/better-auth.ts";
import type { RequestContext } from "../core/types/context.types.ts";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface HonoVariables {
  requestId: string;
  user?: AuthSession["user"] | null;
  session?: AuthSession["session"] | null;
  organizationId?: string | null;
  organization?: Organization | null;
  requestContext: RequestContext;
  validData?: unknown;
}

export type ContextVariables = {
  Variables: HonoVariables;
};
