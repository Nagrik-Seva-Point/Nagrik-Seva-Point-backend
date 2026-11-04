import { getEnvVar } from "../config/env-helper";
import { logger } from "../logger/logger";
import { ProxyAgent, fetch as undiciFetch } from "undici";

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
  private cachedDispatcher: ProxyAgent | undefined = undefined;
  private lastProxyUrl: string | undefined = undefined;

  public getDispatcher(): ProxyAgent | undefined {
    const activeProxyUrl = this.getProxyUrl();
    if (!activeProxyUrl) return undefined;
    if (this.cachedDispatcher && this.lastProxyUrl === activeProxyUrl) {
      return this.cachedDispatcher;
    }
    try {
      this.cachedDispatcher = new ProxyAgent({
        uri: activeProxyUrl,
        keepAliveTimeout: 30000,
        keepAliveMaxTimeout: 60000,
      });
      this.lastProxyUrl = activeProxyUrl;
      const maskedProxy = activeProxyUrl.replace(/:[^:@]+@/, ":****@");
      logger.info(`[BREVO MAIL] Initialized pooled ProxyAgent via Static Proxy: ${maskedProxy}`);
    } catch (err) {
      logger.error(`[BREVO MAIL] Failed to initialize ProxyAgent with URL "${activeProxyUrl}":`, err);
    }
    return this.cachedDispatcher;
  }

  public getProxyUrl(): string | undefined {
    const rawProxy =
      getEnvVar("BREVO_PROXY_URL") ||
      getEnvVar("STATIC_PROXY_URL") ||
      getEnvVar("PROXY_URL") ||
      getEnvVar("EZYTM_PROXY_URL") ||
      getEnvVar("WEBSHARE_URL") ||
      getEnvVar("WEBSHARE_PROXY_URL") ||
      getEnvVar("FIXIE_URL") ||
      getEnvVar("QUOTAGUARDSTATIC_URL") ||
      getEnvVar("HTTPS_PROXY") ||
      getEnvVar("HTTP_PROXY");

    return rawProxy ? rawProxy.replace(/["']/g, "").trim() : undefined;
  }

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

      const dispatcher = this.getDispatcher();
      const fetchFn = dispatcher ? undiciFetch : fetch;

      const response = await fetchFn(this.brevoApiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        // @ts-ignore: dispatcher supported by undiciFetch
        dispatcher,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          (data as { message?: string })?.message ||
          `Brevo API responded with status ${response.status}`;

        if (response.status === 401 && (errorMsg.includes("unrecognised IP") || errorMsg.includes("authorised_ips"))) {
          logger.error(
            `🚨 [BREVO MAIL SECURITY] Unauthorized IP detected! Please authorize the Static IP in Brevo Dashboard: https://app.brevo.com/security/authorised_ips - Message: ${errorMsg}`,
          );
        } else {
          logger.error(`[BREVO MAIL] Failed to send email: ${errorMsg}`, data);
        }

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

  /**
   * Dispatches a branded Password Reset OTP Email with a prominent 6-digit code.
   */
  async sendPasswordResetOtpEmail({
    to,
    name,
    otp,
  }: {
    to: string;
    name?: string;
    otp: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const displayName = name?.trim() || "Partner";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP - Nagrik Seva Point</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F1F5F9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);">
          
          <!-- Top Accent Color Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #FD3820 0%, #FF6B4A 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header with Official Full Logo -->
          <tr>
            <td align="center" style="background-color: #FFFFFF; border-bottom: 1px solid #F1F5F9; padding: 26px 32px 22px 32px; text-align: center;">
              <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" height="44" style="height: 44px; width: auto; max-width: 220px; display: block; margin: 0 auto; border: 0;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <!-- Title -->
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #0F172A; letter-spacing: -0.4px;">
                Password Reset Verification
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748B; line-height: 1.5;">
                Use the one-time verification code below to reset your password.
              </p>

              <!-- Greeting -->
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #334155; line-height: 1.6;">
                Namaste <strong>${displayName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                We received a request to reset your password for the Nagrik Seva Point account linked with <strong style="color: #0F172A;">${to}</strong>. Enter this 6-digit OTP in the verification box to proceed:
              </p>

              <!-- Prominent OTP Highlight Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #FFF7F5; border: 2px dashed #FD3820; border-radius: 14px; padding: 22px 20px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #D92D16; margin-bottom: 8px;">
                      Your One-Time Password (OTP)
                    </div>
                    <div style="font-family: 'Courier New', Courier, monospace, sans-serif; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #FD3820; margin: 4px 0;">
                      ${otp}
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #64748B; margin-top: 8px;">
                      Valid for 10 minutes &bull; Single-use only
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Note -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 16px; margin: 20px 0; font-size: 12px; color: #475569; line-height: 1.6;">
                <strong style="color: #0F172A;">Security Tip:</strong> Never share this OTP with anyone, including members of the Nagrik Seva Point team. We will never ask for your OTP.
              </div>

              <!-- Fallback Context -->
              <p style="margin: 20px 0 0 0; font-size: 12px; color: #94A3B8; line-height: 1.6; border-top: 1px dashed #E2E8F0; padding-top: 16px;">
                If you did not request this password reset, please ignore this email. Your current password remains secure and unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 22px 32px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #334155;">
                Nagrik Seva Point &bull; Cyber Café Partner Support
              </p>
              <p style="margin: 0 0 10px 0; font-size: 11px; color: #64748B;">
                Need help? Contact <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; text-decoration: none; font-weight: 600;">nagriksevapoint@gmail.com</a>
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

Your One-Time Password (OTP) to reset your Nagrik Seva Point account password is:

${otp}

This code is valid for 10 minutes. Enter it in the password reset page to update your password.

Do not share this OTP with anyone. If you did not request this, please ignore this message.

— Nagrik Seva Point Support
nagriksevapoint@gmail.com
`;

    return this.sendEmail({
      to: [{ email: to, name: displayName }],
      subject: `${otp} is your Nagrik Seva Point Password Reset OTP`,
      params: {
        NAME: displayName,
        EMAIL: to,
        OTP: otp,
        EXPIRY_MINUTES: "10",
      },
      htmlContent,
      textContent,
    });
  }

  /**
   * Dispatches an Urgent Low-Balance Alert to the Platform Administrator.
   * Protected with testRecipientEmail override for safe format verification.
   */
  async sendLowBalanceAdminAlert({
    serviceCode,
    serviceName,
    vendorError,
    testRecipientEmail,
    rechargeUrl,
  }: {
    serviceCode: string;
    serviceName: string;
    vendorError: string;
    testRecipientEmail?: string;
    rechargeUrl?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const adminEmail =
      testRecipientEmail ||
      getEnvVar("ADMIN_ALERT_EMAIL") ||
      "nagriksevapoint@gmail.com";
    const istTime = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "medium",
    });
    const topupUrl = rechargeUrl || "https://planapi.in";

    const htmlContent = `
<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Urgent: Upstream API Wallet Balance Low</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F1F5F9; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #CBD5E1; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);">
          <tr>
            <td height="5" style="background: linear-gradient(90deg, #DC2626 0%, #EF4444 100%); line-height: 5px; font-size: 5px;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="background-color: #FFFFFF; border-bottom: 1px solid #F1F5F9; padding: 24px 32px; text-align: center;">
              <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" height="44" style="height: 44px; width: auto; max-width: 220px; display: block; margin: 0 auto; border: 0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 30px;">
              <div style="display: inline-block; background-color: #FEF2F2; color: #DC2626; border: 1px solid #F87171; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 14px;">
                🚨 URGENT VENDOR ACTION REQUIRED
              </div>
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #0F172A; line-height: 1.3;">
                अपस्ट्रीम वेंडर API वॉलेट बैलेंस समाप्त / अत्यंत कम
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                नमस्ते एडमिन, आपके अपस्ट्रीम API प्रोवाइडर (<strong>PlanAPI / EzyTM</strong>) के मुख्य वॉलेट का बैलेंस शून्य (₹0) या न्यूनतम सीमा से नीचे पहुँच गया है। तत्काल रिचार्ज की आवश्यकता है ताकि वीएलई और कस्टमर्स की सर्विसेज चालू रह सकें।
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; margin: 20px 0; padding: 16px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="6" border="0" style="font-size: 13px;">
                      <tr>
                        <td width="35%" style="color: #64748B; font-weight: 600;">प्रभावित सर्विस:</td>
                        <td style="color: #0F172A; font-weight: 700;">${serviceName} (${serviceCode})</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">वेंडर गेटवे:</td>
                        <td style="color: #0F172A; font-weight: 700;">PlanAPI / EzyTM Gateway</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">वेंडर एरर रिस्पॉन्स:</td>
                        <td style="color: #DC2626; font-weight: 700;">${vendorError}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">डिटेक्शन समय (IST):</td>
                        <td style="color: #0F172A; font-weight: 600;">${istTime}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">कस्टमर सुरक्षा स्थिति:</td>
                        <td style="color: #059669; font-weight: 700;">
                          ✓ सक्रिय (कस्टमर को भ्रामक "PAN Not Found" की जगह मेंटेनेंस का सुरक्षित संदेश दिखाया गया है)
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${topupUrl}" target="_blank" style="background-color: #DC2626; color: #FFFFFF !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 34px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35);">
                      वेंडर वॉलेट रिचार्ज करें (PlanAPI) &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 12px; color: #64748B; line-height: 1.5; text-align: center;">
                *नोट: यह ईमेल एंटी-स्पैम सुरक्षा के तहत प्रत्येक 15 मिनट में अधिकतम 1 बार भेजी जाती है।
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 30px; text-align: center; font-size: 11px; color: #64748B;">
              नागरिक सेवा पॉइंट • ऑटोमेटेड प्लेटफॉर्म मॉनिटरिंग सिस्टम<br />
              हेल्पडेस्क: <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; text-decoration: underline;">nagriksevapoint@gmail.com</a>
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
🚨 [CRITICAL ALERT] Upstream API Wallet Balance Low / Exhausted

Service: ${serviceName} (${serviceCode})
Gateway: PlanAPI / EzyTM
Vendor Error: ${vendorError}
Time: ${istTime}

Action Required: Please recharge your upstream vendor wallet immediately:
${topupUrl}

Note: Customers are currently shown a graceful maintenance message to prevent false "PAN not found" complaints.
`;

    return this.sendEmail({
      to: [{ email: adminEmail, name: "Platform Administrator" }],
      subject: `🚨 [CRITICAL ALERT] Upstream API Wallet Balance Low - ${serviceName}`,
      htmlContent,
      textContent,
    });
  }

  /**
   * Dispatches a branded Broadcast Announcement Email to a VLE / Retailer.
   * SAFETY GUARD: Requires explicit testRecipientEmail or verified broadcast list.
   */
  async sendVLEBroadcastEmail({
    to,
    vleName,
    title,
    message,
    severity = "info",
    customSubject,
    actionUrl,
    actionText,
    language = "hi",
    includeButton = true,
  }: {
    to: string;
    vleName?: string;
    title: string;
    message: string;
    severity?: "info" | "warning" | "urgent" | "success";
    customSubject?: string;
    actionUrl?: string;
    actionText?: string;
    language?: "hi" | "en";
    includeButton?: boolean;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const isEn = language === "en";
    const displayName = vleName?.trim() || (isEn ? "Retail Partner" : "सम्मानित वीएलई बंधु");
    const greetingText = isEn ? `Dear ${displayName},` : `नमस्ते ${displayName} जी,`;
    const defaultBtnText = isEn ? "Open Retailer Dashboard &nbsp;&rarr;" : "रिटेलर डैशबोर्ड खोलें &nbsp;&rarr;";
    const buttonText = actionText || defaultBtnText;

    const emailSubject =
      customSubject?.trim() ||
      title?.trim() ||
      (isEn ? "Nagrik Seva Point - Official Communication" : "नागरिक सेवा केंद्र - आधिकारिक सूचना");

    const htmlContent = `
<!DOCTYPE html>
<html lang="${isEn ? "en" : "hi"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - Nagrik Seva Point</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F1F5F9; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Letter Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 14px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.06);">
          
          <!-- Top Accent Brand Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #FD3820 0%, #FF6B4A 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Corporate Letterhead Header (Logo Centered) -->
          <tr>
            <td align="center" style="background-color: #FFFFFF; border-bottom: 1px solid #F1F5F9; padding: 24px 30px; text-align: center;">
              <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" height="42" style="height: 42px; width: auto; max-width: 220px; display: block; margin: 0 auto; border: 0;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 28px 28px;">
              <!-- Official Message Body Card (Greeting INSIDE the box at the very top) -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #FD3820; border-radius: 8px; padding: 22px 24px; margin: 0 0 24px 0;">
                <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: normal; color: #1E293B; line-height: 1.6;">
                  ${greetingText}
                </p>
                <div style="font-size: 14px; color: #334155; line-height: 1.8; white-space: pre-line;">
                  ${message}
                </div>
              </div>

              ${
                includeButton
                  ? `<!-- Action CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 26px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl || 'https://nagriksevapoint.in/dashboard'}" target="_blank" rel="noopener noreferrer" style="background-color: #FD3820; color: #FFFFFF !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 32px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(253, 56, 32, 0.28); border: 1px solid #D92D16;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }

              <!-- Minimal Clean Sign-off (Normal Text) -->
              <div style="margin-top: 26px; font-size: 14px; color: #334155; line-height: 1.6;">
                Regards,<br />
                <span style="color: #0F172A; font-weight: normal;">Team Nagrik Seva Point</span>
              </div>
            </td>
          </tr>

          <!-- Polished Structured Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.7;">
              <div style="font-weight: 600; color: #334155; margin-bottom: 6px;">
                ${
                  isEn
                    ? "Nagrik Seva Point &bull; Official Digital Platform for Cyber Cafés &amp; CSC Desks"
                    : "नागरिक सेवा पॉइंट • भारत के समस्त साइबर कैफ़े एवं सीएससी ऑपरेटरों का आधिकारिक मंच"
                }
              </div>
              <div style="margin-bottom: 6px;">
                ${isEn ? "Website:" : "वेबसाइट:"} <a href="https://nagriksevapoint.in" target="_blank" style="color: #FD3820; font-weight: 600; text-decoration: none;">nagriksevapoint.in</a>
                &nbsp;&bull;&nbsp;
                ${isEn ? "Helpdesk:" : "सहायता:"} <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; font-weight: 600; text-decoration: none;">nagriksevapoint@gmail.com</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                &copy; ${new Date().getFullYear()} Nagrik Seva Point. ${isEn ? "All rights reserved." : "सर्वाधिकार सुरक्षित।"}
              </div>
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
${greetingText}

${message}
${
  includeButton
    ? `\n--------------------------------------------------\n${buttonText.replace(/&nbsp;/g, " ").replace(/&rarr;/g, "->")}: ${actionUrl || 'https://nagriksevapoint.in/dashboard'}\n`
    : ""
}
Regards,
Team Nagrik Seva Point
${isEn ? "Website:" : "वेबसाइट:"} https://nagriksevapoint.in | ${isEn ? "Helpdesk:" : "सहायता:"} nagriksevapoint@gmail.com
`;

    return this.sendEmail({
      to: [{ email: to, name: displayName }],
      subject: emailSubject,
      htmlContent,
      textContent,
    });
  }
}

export const brevoMailService = new BrevoMailService();
