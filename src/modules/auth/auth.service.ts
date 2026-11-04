import { randomInt, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../../core/db/prisma";
import { auth } from "../../core/auth/better-auth";
import { redis } from "../../core/redis/redis.client";
import { brevoMailService } from "../../core/mail/brevo.service";
import { invalidateAuthContext } from "../../middleware/request-context.middleware";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import {
  logApiExecution,
  maskEmail,
  maskPhoneNumber,
} from "../../core/logger/api-logger";
import type {
  CheckAvailabilityInput,
  ForgotPasswordInput,
  VerifyResetOtpInput,
  LoginInput,
  RegisterRetailerInput,
  ResetPasswordInput,
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
      const cleanPhone = rawIdentifier.replace(/\D/g, "");

      if (cleanPhone.length !== 10) {
        throw AppError.badRequest(
          "Mobile number must be exactly 10 digits",
          "INVALID_PHONE",
        );
      }

      const user = await prisma.user.findFirst({
        where: { phone: cleanPhone },
      });

      if (!user) {
        throw AppError.unauthorized(
          "Invalid email, mobile number or password",
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

        // Prime Redis caches so subsequent requests resolve organization in <0.5ms with zero DB queries
        await Promise.all([
          redis.setJson(
            `cache:user_primary_org:${userId}`,
            {
              organizationId: membership.organizationId,
              organization: membership.organization,
            },
            86400,
          ),
          redis.setJson(
            `cache:user_org_membership:${userId}:${membership.organizationId}`,
            {
              organizationId: membership.organizationId,
              organization: membership.organization,
            },
            86400,
          ),
        ]).catch(() => {});
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
    const cacheKey = `cache:profile:${userId}:${requestedOrgId || "DEFAULT"}`;

    return await redis.remember(cacheKey, 30, async () => {
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
    });
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

    // Invalidate cached profile, primary org & auth context so changes are immediately visible
    await Promise.all([
      redis.delPattern(`cache:profile:${userId}:*`),
      redis.del(`cache:user_primary_org:${userId}`),
      redis.delPattern(`cache:user_org_membership:${userId}:*`),
    ]).catch(() => {});
    invalidateAuthContext();

    return this.getProfile(userId, requestedOrgId);
  }

  /**
   * Dispatches a 6-digit verification OTP to the user's registered email address.
   */
  async forgotPassword(data: ForgotPasswordInput, headers: Headers) {
    const rawIdentifier = data.identifier.trim();
    const clientIp =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "127.0.0.1";

    let targetUser: { id: string; email: string; name: string; phone: string | null } | null = null;

    if (!rawIdentifier.includes("@")) {
      // 1. Mobile number lookup (strictly 10 digits)
      const cleanPhone = rawIdentifier.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        throw AppError.badRequest(
          "Mobile number must be exactly 10 digits",
          "INVALID_PHONE",
        );
      }
      targetUser = await prisma.user.findFirst({
        where: { phone: cleanPhone },
        select: { id: true, email: true, name: true, phone: true },
      });
    } else {
      // 2. Email address lookup
      targetUser = await prisma.user.findFirst({
        where: { email: rawIdentifier.toLowerCase() },
        select: { id: true, email: true, name: true, phone: true },
      });
    }

    if (!targetUser) {
      // Record failed/unregistered lookup in audit trail
      logApiExecution({
        serviceCode: "AUTH",
        action: "Password Reset Failed (Account Not Found)",
        endpoint: "/api/auth/forgot-password",
        reference: rawIdentifier.includes("@") ? maskEmail(rawIdentifier) : maskPhoneNumber(rawIdentifier),
        status: "FAILED",
        statusCode: 404,
        ipAddress: clientIp,
        note: `Password reset attempt for unregistered identifier: ${rawIdentifier.includes("@") ? maskEmail(rawIdentifier) : maskPhoneNumber(rawIdentifier)}`,
      }).catch(() => {});

      throw AppError.notFound(
        rawIdentifier.includes("@")
          ? "No account found with this email address. Please check and try again or create an account."
          : "No account found with this 10-digit mobile number. Please check and try again or create an account.",
        "ACCOUNT_NOT_FOUND",
      );
    }

    // Rate-limit resend check: minimum 30s cooldown
    const cooldownKey = `otp:cooldown:${targetUser.id}`;
    const isInCooldown = await redis.get(cooldownKey).catch(() => null);
    if (isInCooldown) {
      throw AppError.badRequest(
        "Please wait a few seconds before requesting another OTP.",
        "OTP_COOLDOWN",
      );
    }

    // Generate cryptographically secure 6-digit OTP
    const otp = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in Prisma Verification table (persistent across serverless instances)
    await prisma.verification.deleteMany({
      where: { identifier: `password-reset-otp:${targetUser.id}` },
    }).catch(() => {});

    await prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: `password-reset-otp:${targetUser.id}`,
        value: JSON.stringify({ otp, attempts: 0 }),
        expiresAt,
      },
    });

    // Also store in Redis with 10-minute TTL and 30-second cooldown
    await Promise.all([
      redis.setJson(`otp:reset:${targetUser.id}`, { otp, attempts: 0 }, 600),
      redis.set(cooldownKey, "1", 30),
    ]).catch(() => {});

    // Dispatch via Brevo Mail Service
    await brevoMailService.sendPasswordResetOtpEmail({
      to: targetUser.email,
      name: targetUser.name,
      otp,
    });

    const maskedEmail = maskEmail(targetUser.email);

    // Look up user's organization for multi-tenant audit trail
    const userOrg = await prisma.member.findFirst({
      where: { userId: targetUser.id },
      select: { organizationId: true },
    }).catch(() => null);

    // Record audit trail event
    logApiExecution({
      userId: targetUser.id,
      organizationId: userOrg?.organizationId || null,
      serviceCode: "AUTH",
      action: "Password Reset OTP Dispatched",
      endpoint: "/api/auth/forgot-password",
      reference: maskedEmail,
      status: "SUCCESS",
      statusCode: 200,
      ipAddress: clientIp,
      note: `6-digit reset OTP dispatched via email to ${maskedEmail}`,
    }).catch(() => {});

    return {
      success: true,
      maskedEmail,
      message: "A 6-digit verification OTP has been sent to your registered email address.",
    };
  }

  /**
   * Verifies the 6-digit OTP and generates a single-use reset token.
   */
  async verifyResetOtp(data: VerifyResetOtpInput, headers: Headers) {
    const rawIdentifier = data.identifier.trim();
    const cleanOtp = data.otp.trim();
    const clientIp =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "127.0.0.1";

    let targetUser: { id: string; email: string; name: string } | null = null;
    if (!rawIdentifier.includes("@")) {
      const cleanPhone = rawIdentifier.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        throw AppError.badRequest(
          "Mobile number must be exactly 10 digits",
          "INVALID_PHONE",
        );
      }
      targetUser = await prisma.user.findFirst({
        where: { phone: cleanPhone },
        select: { id: true, email: true, name: true },
      });
    } else {
      targetUser = await prisma.user.findFirst({
        where: { email: rawIdentifier.toLowerCase() },
        select: { id: true, email: true, name: true },
      });
    }

    if (!targetUser) {
      throw AppError.notFound("Account not found. Please try again.", "ACCOUNT_NOT_FOUND");
    }

    // 1. Fast L1 Redis Check first (< 1ms vs ~250ms DB roundtrip)
    const cachedOtpData = await redis.getJson<{ otp: string; attempts: number }>(
      `otp:reset:${targetUser.id}`,
    ).catch(() => null);

    let stored: { otp: string; attempts: number } = { otp: "", attempts: 0 };
    let recordId: string | null = null;

    if (cachedOtpData) {
      stored = cachedOtpData;
    } else {
      // Fallback to database only if Redis cache was evicted
      const record = await prisma.verification.findFirst({
        where: { identifier: `password-reset-otp:${targetUser.id}` },
      }).catch(() => null);

      if (!record || new Date() > record.expiresAt) {
        throw AppError.badRequest(
          "Verification code has expired or is invalid. Please request a new OTP.",
          "OTP_EXPIRED",
        );
      }

      try {
        stored = JSON.parse(record.value);
      } catch {
        stored = { otp: record.value, attempts: 0 };
      }
      recordId = record.id;
    }

    if (stored.attempts >= 5) {
      await Promise.all([
        prisma.verification.deleteMany({
          where: { identifier: `password-reset-otp:${targetUser.id}` },
        }).catch(() => {}),
        redis.del(`otp:reset:${targetUser.id}`).catch(() => {}),
      ]);
      throw AppError.badRequest(
        "Too many incorrect attempts. Please request a new OTP.",
        "OTP_MAX_ATTEMPTS",
      );
    }

    if (stored.otp !== cleanOtp) {
      stored.attempts += 1;
      await Promise.all([
        recordId
          ? prisma.verification.update({
              where: { id: recordId },
              data: { value: JSON.stringify(stored) },
            }).catch(() => {})
          : Promise.resolve(),
        redis.setJson(`otp:reset:${targetUser.id}`, stored, 600).catch(() => {}),
      ]);

      throw AppError.badRequest(
        "Incorrect OTP code. Please enter the valid 6-digit code sent to your email.",
        "INVALID_OTP",
      );
    }

    // Generate secure single-use reset token
    const resetToken = randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Execute token creation, OTP cleanup in Redis & Prisma concurrently (saves multiple roundtrips)
    await Promise.all([
      redis.setJson(
        `reset_token:${resetToken}`,
        { userId: targetUser.id, email: targetUser.email },
        900,
      ).catch(() => {}),
      redis.del(`otp:reset:${targetUser.id}`).catch(() => {}),
      prisma.verification.create({
        data: {
          id: randomUUID(),
          identifier: `password-reset-token:${resetToken}`,
          value: targetUser.id,
          expiresAt: tokenExpiry,
        },
      }),
      prisma.verification.deleteMany({
        where: { identifier: `password-reset-otp:${targetUser.id}` },
      }).catch(() => {}),
    ]);

    logApiExecution({
      userId: targetUser.id,
      serviceCode: "AUTH",
      action: "Password Reset OTP Verified",
      endpoint: "/api/auth/verify-reset-otp",
      reference: maskEmail(targetUser.email),
      status: "SUCCESS",
      statusCode: 200,
      ipAddress: clientIp,
      note: "OTP successfully verified. Reset token issued for password update.",
    }).catch(() => {});

    return {
      success: true,
      resetToken,
      message: "OTP verified successfully. You can now set your new password.",
    };
  }

  /**
   * Resets the user's password using the verified one-time reset token.
   */
  async resetPassword(data: ResetPasswordInput, headers: Headers) {
    const clientIp =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "127.0.0.1";

    const tokenKey = `password-reset-token:${data.token}`;
    const tokenRecord = await prisma.verification.findFirst({
      where: { identifier: tokenKey },
    }).catch(() => null);

    if (tokenRecord && new Date() <= tokenRecord.expiresAt) {
      const userId = tokenRecord.value;
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });

      if (!targetUser) {
        throw AppError.notFound("User account not found.", "USER_NOT_FOUND");
      }

      // Hash password using Better-Auth's secure password hasher
      const hashedPassword = await hashPassword(data.newPassword);

      // Update credential account
      await prisma.account.updateMany({
        where: {
          userId: targetUser.id,
          providerId: "credential",
        },
        data: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      });

      // Revoke all existing sessions for security
      await prisma.session.deleteMany({
        where: { userId: targetUser.id },
      }).catch(() => {});

      // Invalidate token and caches
      await Promise.all([
        prisma.verification.deleteMany({ where: { identifier: tokenKey } }),
        redis.del(`reset_token:${data.token}`),
        redis.delPattern(`cache:profile:${targetUser.id}:*`),
        redis.del(`cache:user_primary_org:${targetUser.id}`),
        redis.delPattern(`cache:user_org_membership:${targetUser.id}:*`),
      ]).catch(() => {});
      invalidateAuthContext();

      // Log successful password reset
      logApiExecution({
        userId: targetUser.id,
        serviceCode: "AUTH",
        action: "Password Reset Completed",
        endpoint: "/api/auth/reset-password",
        reference: maskEmail(targetUser.email),
        status: "SUCCESS",
        statusCode: 200,
        ipAddress: clientIp,
        note: `Password successfully updated via OTP verification for ${maskEmail(targetUser.email)}`,
      }).catch(() => {});

      return {
        success: true,
        message: "Password reset successfully. You can now sign in with your new password.",
      };
    }

    // Fallback to legacy Better-Auth resetPassword for any existing legacy URL tokens
    try {
      await auth.api.resetPassword({
        body: {
          token: data.token,
          newPassword: data.newPassword,
        },
        headers,
      });

      return {
        success: true,
        message: "Password reset successfully. You can now sign in with your new password.",
      };
    } catch (err: any) {
      logger.error("Failed to reset password:", err);
      const msg = err?.body?.message || err?.message || "Invalid or expired reset token. Please request a new OTP.";
      throw AppError.badRequest(msg, "INVALID_TOKEN");
    }
  }
}

export const authService = new AuthService();

