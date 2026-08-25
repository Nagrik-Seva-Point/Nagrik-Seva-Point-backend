import { prisma } from "../core/db/prisma";
import { AppError } from "../core/errors/AppError";
import type { MiddlewareHandler } from "hono";
import type { ContextVariables } from "../app/context";

export const organizationMiddleware = (): MiddlewareHandler<
  ContextVariables
> => {
  return async (c, next) => {
    const user = c.get("user");
    const session = c.get("session");

    if (!user || !session) {
      throw AppError.unauthorized("Authentication required");
    }

    let organizationId: string | null = session.activeOrganizationId ?? null;
    if (!organizationId) {
      organizationId = c.req.header("X-Organization-Id") || null;
    }

    if (!organizationId) {
      throw AppError.badRequest(
        "Organization context required",
        "ORGANIZATION_REQUIRED",
      );
    }

    // Verify membership to guarantee tenant isolation
    const membership = await prisma.member.findFirst({
      where: {
        organizationId,
        userId: user.id,
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      throw AppError.forbidden(
        "Access denied: You are not a member of this organization",
      );
    }

    c.set("organizationId", organizationId);
    c.set("organization", membership.organization);
    await next();
  };
};
