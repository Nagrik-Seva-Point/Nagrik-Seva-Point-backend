import { prisma } from "../../core/db/prisma";
import { auth } from "../../core/auth/better-auth";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { logApiExecution } from "../../core/logger/api-logger";
import type {
  CheckAvailabilityInput,
  LoginInput,
  RegisterRetailerInput,
  UpdateProfileInput,
} from "./auth.schema";

export class AuthService {
  /**
   * Checks if an email or phone is already registered before moving to next step.
   */
  async checkAvailability(data: CheckAvailabilityInput) {
    if (data.email) {
      const cleanEmail = data.email.toLowerCase().trim();
      const existingEmail = await prisma.user.findFirst({
        where: { email: cleanEmail },
      });
      if (existingEmail) {
        return {
          available: false,
          field: "email",
          message:
            "An account with this email address already exists. Please sign in instead.",
        };
      }
    }

    if (data.phone) {
      const cleanPhone = data.phone.trim();
      const existingPhone = await prisma.user.findFirst({
        where: { phone: cleanPhone },
      });
      if (existingPhone) {
        return {
          available: false,
          field: "phone",
          message:
            "An account with this mobile number already exists. Please sign in instead.",
        };
      }
    }

    return {
      available: true,
      message: "Credentials available",
    };
  }

  /**
   * Registers a new Cyber Café partner, atomically creates their Organization,
   * assigns the owner membership, provisions a wallet, and returns active session.
   */
  async registerRetailer(data: RegisterRetailerInput, headers: Headers) {
    const cleanEmail = data.email.toLowerCase().trim();
    const cleanPhone = data.phone.trim();

    // 1. Check for existing email or phone
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { phone: cleanPhone }],
      },
    });

    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        throw AppError.badRequest(
          "An account with this email address already exists. Please sign in instead.",
          "EMAIL_EXISTS",
        );
      }
      if (existingUser.phone === cleanPhone) {
        throw AppError.badRequest(
          "An account with this mobile number already exists. Please sign in instead.",
          "PHONE_EXISTS",
        );
      }
    }

    // 2. Create User and Credential Account via Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: data.name.trim(),
        email: cleanEmail,
        password: data.password,
        phone: cleanPhone,
      },
      headers,
    });

    if (!signUpResult || !signUpResult.user) {
      throw AppError.internal(
        "Failed to initialize user authentication credentials",
      );
    }

    const userId = signUpResult.user.id;

    // 3. Atomically Provision Cyber Café Organization, Owner Member, and Wallet
    const slugBase = data.cyberCafeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const slug = `${slugBase || "cyber-point"}-${randomSuffix}`;

    const organization = await prisma.organization.create({
      data: {
        name: data.cyberCafeName.trim(),
        slug,
        members: {
          create: {
            userId,
            role: "owner",
          },
        },
        wallet: {
          create: {
            balance: 0.00,
            currency: "INR",
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    // 4. Set activeOrganizationId on the newly created session
    if (signUpResult.token) {
      await prisma.session.updateMany({
        where: { token: signUpResult.token },
        data: { activeOrganizationId: organization.id },
      });
    }

    logger.info(
      `Retailer successfully registered: ${userId} with Cyber Café: ${organization.id} (${organization.name})`,
    );

    logApiExecution({
      organizationId: organization.id,
      userId,
      serviceCode: "AUTH",
      action: "New Retailer Registered & Session Started",
      endpoint: "/api/v1/auth/register",
      reference: `AUTH-${userId.slice(0, 8).toUpperCase()}`,
      status: "SUCCESS",
      statusCode: 201,
      note: `${signUpResult.user.name} registered café "${data.cyberCafeName}" and started workspace session.`,
    }).catch(() => {});

    return {
      user: {
        id: signUpResult.user.id,
        name: signUpResult.user.name,
        email: signUpResult.user.email,
        phone: cleanPhone,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: "owner",
        walletBalance: 0.00,
      },
      token: signUpResult.token,
    };
  }

  /**
   * Smart login supporting both Email + Password and Phone (10 Digits) + Password.
   */
  async login(data: LoginInput, headers: Headers) {
    const rawIdentifier = data.identifier.trim();
    let targetEmail = rawIdentifier.toLowerCase();

    // 1. If identifier is a phone number (does not contain @)
    if (!rawIdentifier.includes("@")) {
      const user = await prisma.user.findUnique({
        where: { phone: rawIdentifier },
      });

      if (!user) {
        throw AppError.unauthorized(
          "Invalid mobile number or password",
          "AUTH_FAILED",
        );
      }

      targetEmail = user.email;
    }

    // 2. Authenticate credentials via Better Auth
    try {
      const signInResult = await auth.api.signInEmail({
        body: {
          email: targetEmail,
          password: data.password,
        },
        headers,
      });

      if (!signInResult || !signInResult.user) {
        throw AppError.unauthorized("Invalid credentials", "AUTH_FAILED");
      }

      const userId = signInResult.user.id;

      // 3. Resolve user's primary Cyber Café organization membership
      const membership = await prisma.member.findFirst({
        where: { userId },
        include: {
          organization: {
            include: {
              wallet: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      // 4. Update session activeOrganizationId
      if (membership && signInResult.token) {
        await prisma.session.updateMany({
          where: { token: signInResult.token },
          data: { activeOrganizationId: membership.organizationId },
        });
      }

      logger.info(`User ${userId} logged in successfully.`);

      logApiExecution({
        organizationId: membership?.organizationId || null,
        userId: signInResult.user.id,
        serviceCode: "AUTH",
        action: "Operator Login & Session Started",
        endpoint: "/api/v1/auth/login",
        reference: `AUTH-${signInResult.user.id.slice(0, 8).toUpperCase()}`,
        status: "SUCCESS",
        statusCode: 200,
        note: `${signInResult.user.name} (${signInResult.user.email}) logged into Cyber Café workspace.`,
      }).catch(() => {});

      return {
        user: {
          id: signInResult.user.id,
          name: signInResult.user.name,
          email: signInResult.user.email,
        },
        organization: membership
          ? {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            role: membership.role,
            walletBalance: membership.organization.wallet
              ? Number(membership.organization.wallet.balance)
              : 0.00,
          }
          : null,
        token: signInResult.token,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error("Login verification error:", error);
      throw AppError.unauthorized(
        "Invalid email, mobile number or password",
        "AUTH_FAILED",
      );
    }
  }

  /**
   * Fetches full profile details including user information and associated Cyber Café organization metrics.
   */
  async getProfile(userId: string, requestedOrgId?: string | null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw AppError.notFound("User account not found");
    }

    // Resolve user's organization: either requestedOrgId if member, or primary membership
    let membership = null;
    if (requestedOrgId) {
      membership = await prisma.member.findFirst({
        where: { userId, organizationId: requestedOrgId },
        include: {
          organization: {
            include: {
              wallet: true,
            },
          },
        },
      });
    }

    if (!membership) {
      membership = await prisma.member.findFirst({
        where: { userId },
        include: {
          organization: {
            include: {
              wallet: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }

    let organizationData = null;
    if (membership?.organization) {
      const orgId = membership.organization.id;
      const [memberCount, customerCount, requestCount] = await Promise.all([
        prisma.member.count({ where: { organizationId: orgId } }),
        prisma.customer.count({ where: { organizationId: orgId } }),
        prisma.serviceRequest.count({ where: { organizationId: orgId } }),
      ]);

      organizationData = {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        logo: membership.organization.logo,
        metadata: membership.organization.metadata,
        createdAt: membership.organization.createdAt,
        role: membership.role,
        walletBalance: membership.organization.wallet
          ? Number(membership.organization.wallet.balance)
          : 0.0,
        stats: {
          memberCount,
          customerCount,
          requestCount,
        },
      };
    }

    return {
      user,
      organization: organizationData,
    };
  }

  /**
   * Updates owner profile details and/or Cyber Café organisation name.
   */
  async updateProfile(
    userId: string,
    requestedOrgId: string | null,
    data: UpdateProfileInput,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.notFound("User account not found");
    }

    const userUpdates: { name?: string; phone?: string } = {};

    if (data.name && data.name.trim() && data.name.trim() !== user.name) {
      userUpdates.name = data.name.trim();
    }

    if (data.phone && data.phone.trim() && data.phone.trim() !== user.phone) {
      const cleanPhone = data.phone.trim();
      const existingWithPhone = await prisma.user.findFirst({
        where: { phone: cleanPhone, NOT: { id: userId } },
      });
      if (existingWithPhone) {
        throw AppError.badRequest(
          "An account with this mobile number already exists. Please enter a different number.",
          "PHONE_EXISTS",
        );
      }
      userUpdates.phone = cleanPhone;
    }

    if (Object.keys(userUpdates).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdates,
      });
    }

    // Update organization name if requested and authorized
    if (data.cyberCafeName && data.cyberCafeName.trim()) {
      let orgId = requestedOrgId;
      if (!orgId) {
        const primaryMembership = await prisma.member.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
        });
        orgId = primaryMembership?.organizationId || null;
      }

      if (orgId) {
        const membership = await prisma.member.findFirst({
          where: { userId, organizationId: orgId },
        });

        const isPrivileged =
          membership?.role === "owner" ||
          membership?.role === "admin" ||
          user.role === "ADMIN" ||
          user.role === "SUPER_ADMIN";

        if (!isPrivileged) {
          throw AppError.forbidden(
            "Only the Cyber Café owner or an administrator can update the business name.",
          );
        }

        await prisma.organization.update({
          where: { id: orgId },
          data: { name: data.cyberCafeName.trim() },
        });
      }
    }

    return this.getProfile(userId, requestedOrgId);
  }
}

export const authService = new AuthService();

