import { getEnvVar } from "../config/env-helper";
import { logger } from "../logger/logger";

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: string | BrevoRecipient[];
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, unknown>;
  sender?: {
    name: string;
    email: string;
  };
}

export class BrevoMailService {
  private readonly brevoApiUrl = "https://api.brevo.com/v3/smtp/email";

  private getApiKey(): string | undefined {
    return (
      getEnvVar("BREVO_API_KEY") ||
      getEnvVar("SENDINBLUE_API_KEY") ||
      undefined
    );
  }

  private getDefaultSender(): { name: string; email: string } {
    const email =
      getEnvVar("BREVO_SENDER_EMAIL") ||
      getEnvVar("SMTP_FROM") ||
      "nagriksevapoint@gmail.com";
    const name =
      getEnvVar("BREVO_SENDER_NAME") ||
      "Nagrik Seva Point";
    return { name, email };
  }

  /**
   * Sends a transactional email using Brevo's v3 REST API.
   */
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const apiKey = this.getApiKey();
    const sender = options.sender || this.getDefaultSender();

    const recipients: BrevoRecipient[] = Array.isArray(options.to)
      ? options.to
      : [{ email: options.to }];

    if (!apiKey) {
      logger.warn(
        `[BREVO MAIL] BREVO_API_KEY is not set in .env. Email to ${recipients.map((r) => r.email).join(", ")} was not sent via Brevo.`,
      );
      return {
        success: false,
        error: "BREVO_API_KEY not configured",
      };
    }

    try {
      const payload: Record<string, unknown> = {
        sender,
        to: recipients,
      };

      if (options.templateId) {
        payload.templateId = options.templateId;
        if (options.params) {
          payload.params = options.params;
        }
      } else {
        payload.subject = options.subject || "Important Notification";
        payload.htmlContent = options.htmlContent || "<p>Notification</p>";
        if (options.textContent) {
          payload.textContent = options.textContent;
        }
      }

      const response = await fetch(this.brevoApiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          (data as { message?: string })?.message ||
          `Brevo API responded with status ${response.status}`;
        logger.error(`[BREVO MAIL] Failed to send email: ${errorMsg}`, data);
        return { success: false, error: errorMsg };
      }

      const messageId = (data as { messageId?: string })?.messageId;
      logger.info(
        `[BREVO MAIL] Email sent successfully to ${recipients.map((r) => r.email).join(", ")} (MessageId: ${messageId || "ok"})`,
      );

      return {
        success: true,
        messageId,
      };
    } catch (err: any) {
      logger.error("[BREVO MAIL] Unexpected network/runtime error:", err);
      return {
        success: false,
        error: err.message || "Failed to send email via Brevo",
      };
    }
  }

  /**
   * Dispatches a branded Password Reset Email to a registered retailer or user.
   */
  async sendPasswordResetEmail({
    to,
    name,
    resetUrl,
    token,
  }: {
    to: string;
    name?: string;
    resetUrl: string;
    token: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const displayName = name?.trim() || "Partner";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password - Nagrik Seva Point</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F1F5F9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);">
          
          <!-- Top Accent Color Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #FD3820 0%, #FF6B4A 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header with Official Full Logo (Centered on Light Background for Full Contrast) -->
          <tr>
            <td align="center" style="background-color: #FFFFFF; border-bottom: 1px solid #F1F5F9; padding: 28px 32px 24px 32px; text-align: center;">
              <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" height="46" style="height: 46px; width: auto; max-width: 220px; display: block; margin: 0 auto; border: 0;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <!-- Title -->
              <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px; line-height: 1.3;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748B; line-height: 1.5;">
                Authorized request for your Nagrik Seva Point café workspace account.
              </p>

              <!-- Greeting & Context -->
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #334155; line-height: 1.6;">
                Namaste <strong>${displayName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                We received a request to reset the password for your account linked with <span style="font-weight: 600; color: #0F172A;">${to}</span>. To choose a new password, click the button below:
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #FD3820; color: #FFFFFF !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(253, 56, 32, 0.35); border: 1px solid #D92D16;">
                      Reset Password &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Information Pills -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; margin: 24px 0; padding: 16px;">
                <tr>
                  <td style="font-size: 12px; color: #475569; line-height: 1.6;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="6" border="0">
                      <tr>
                        <td width="33%" align="center" style="border-right: 1px solid #E2E8F0;">
                          <div style="font-weight: 700; color: #0F172A; font-size: 13px;">60 Minutes</div>
                          <div style="font-size: 11px; color: #64748B; margin-top: 3px;">Link Validity</div>
                        </td>
                        <td width="33%" align="center" style="border-right: 1px solid #E2E8F0;">
                          <div style="font-weight: 700; color: #0F172A; font-size: 13px;">One-Time Use</div>
                          <div style="font-size: 11px; color: #64748B; margin-top: 3px;">Single Token</div>
                        </td>
                        <td width="33%" align="center">
                          <div style="font-weight: 700; color: #0F172A; font-size: 13px;">Encrypted</div>
                          <div style="font-size: 11px; color: #64748B; margin-top: 3px;">Account Safe</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <p style="margin: 24px 0 8px 0; font-size: 12px; font-weight: 600; color: #64748B;">
                Button not working? Copy and paste this link in your browser:
              </p>
              <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #475569; word-break: break-all; line-height: 1.5; font-family: monospace;">
                <a href="${resetUrl}" target="_blank" style="color: #FD3820; text-decoration: underline;">${resetUrl}</a>
              </div>

              <!-- Security Reassurance -->
              <p style="margin: 24px 0 0 0; font-size: 12px; color: #94A3B8; line-height: 1.6; border-top: 1px dashed #E2E8F0; padding-top: 18px;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged and your account access is unaffected.
              </p>
            </td>
          </tr>

          <!-- Professional Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 24px 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #334155;">
                Nagrik Seva Point &bull; Dedicated Café Partner Support
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748B; line-height: 1.5;">
                For queries or assistance, write to us at <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; text-decoration: none; font-weight: 600;">nagriksevapoint@gmail.com</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">
                &copy; 2026 Nagrik Seva Point. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const textContent = `
Namaste ${displayName},

We received a request to reset your password for your Nagrik Seva Point account (${to}).

To reset your password, please visit the following secure link:
${resetUrl}

This link is valid for 60 minutes.

If you did not request this password reset, please ignore this email. Your password will remain unchanged.

— Nagrik Seva Point Team
nagriksevapoint@gmail.com
`;

    const configuredTemplateId =
      getEnvVar("BREVO_RESET_TEMPLATE_ID") ||
      getEnvVar("BREVO_TEMPLATE_ID");
    const parsedTemplateId = configuredTemplateId
      ? parseInt(configuredTemplateId, 10)
      : undefined;

    return this.sendEmail({
      to: [{ email: to, name: displayName }],
      subject: "Reset your Nagrik Seva Point password",
      templateId:
        parsedTemplateId && !isNaN(parsedTemplateId)
          ? parsedTemplateId
          : undefined,
      params: {
        NAME: displayName,
        EMAIL: to,
        RESET_URL: resetUrl,
        TOKEN: token,
        EXPIRY_MINUTES: "60",
      },
      htmlContent,
      textContent,
    });
  }
}

export const brevoMailService = new BrevoMailService();
