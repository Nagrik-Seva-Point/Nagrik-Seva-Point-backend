import { logger } from "../logger/logger";
import { brevoMailService } from "./brevo.service";

export interface PaymentEmailSuccessParams {
  to: string;
  userName?: string;
  orgName?: string;
  amount: number;
  newBalance?: number;
  orderId: string;
  paymentId?: string;
  bankReference?: string;
  paymentMode?: string;
  serviceName?: string;
  paidAt?: string;
}

export interface PaymentEmailFailedParams {
  to: string;
  userName?: string;
  orgName?: string;
  amount: number;
  orderId: string;
  errorMessage?: string;
  failedAt?: string;
}

export class PaymentEmailService {
  /**
   * Formats a name with honorific "Namaste {Name}" for email greetings. If the name is empty or undefined, defaults to "Operator".
   */
  private formatGreetingName(name?: string): string {
    const clean = (name || "Operator").trim();
    if (clean.toLowerCase()) {
      return clean;
    }
    return `${clean}`;
  }

  /**
   * Generates production-ready, mobile-responsive HTML for Payment / Wallet Topup Success
   * Language: Professional English (with "Namaste {Name}" greeting)
   * Palette: Nagrik Orange (#FD3820), Nagrik Navy (#122134), Slate 50 (#F8FAFC)
   */
  public generateSuccessEmailHtml(params: PaymentEmailSuccessParams): { subject: string; html: string; text: string } {
    const rawUserName = params.userName || "Operator";
    const greeting = `Namaste ${this.formatGreetingName(rawUserName)},`;
    const orgName = params.orgName?.trim() || (rawUserName !== "Operator" ? `${rawUserName}'s Cyber Café` : "Cyber Café");
    const amountStr = Number(params.amount || 0).toFixed(2);
    const balanceStr = params.newBalance !== undefined ? Number(params.newBalance).toFixed(2) : undefined;
    const dateStr = params.paidAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const orderId = params.orderId || "CF_ORD_PREVIEW";
    const txnId = params.paymentId || params.bankReference || "TXN_UPI_LIVE";
    const mode = params.paymentMode || "UPI / QR Gateway";
    const service = params.serviceName || "Cyber Café Wallet Top-up";

    const subject = `Payment Received (₹${amountStr}) - Nagrik Seva Point`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #122134;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #CBD5E1; box-shadow: 0 4px 16px rgba(18, 33, 52, 0.06);">
          
          <!-- Top Nagrik Orange Brand Stripe -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #FD3820 0%, #D92D16 100%);"></td>
          </tr>

          <!-- Core Header with Official Website Logo -->
          <tr>
            <td style="background-color: #FFFFFF; padding: 24px 32px 20px 32px; text-align: center; border-bottom: 1px solid #E2E8F0;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" width="220" style="display: block; border: 0; outline: none; text-decoration: none; max-width: 220px; height: auto; margin: 0 auto;" />
                    </a>
                    <div style="font-size: 11px; font-weight: 700; color: #FD3820; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 8px;">
                      Official Retailer &amp; Operator Desk
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Success Alert Ribbon -->
          <tr>
            <td style="background-color: #ECFDF5; border-bottom: 1px solid #D1FAE5; padding: 13px 24px; text-align: center;">
              <div style="display: inline-block; vertical-align: middle;">
                <span style="display: inline-block; background-color: #059669; color: #FFFFFF; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 8px;">
                  ✓ Payment Successful
                </span>
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px 24px 32px;">
              <!-- Greeting with 'Namaste {Name}' -->
              <h1 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; color: #122134;">
                ${greeting}
              </h1>
              <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Your payment of <strong style="color: #122134;">₹${amountStr}</strong> for <strong style="color: #122134;">${orgName}</strong> has been successfully processed and credited to your Nagrik Seva Point wallet.
              </p>

              <!-- Highlighted Amount Card -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">
                      Amount Paid
                    </div>
                    <div style="font-size: 34px; font-weight: 800; color: #059669; font-family: monospace; letter-spacing: -1px;">
                      ₹${amountStr}
                    </div>
                    ${
                      balanceStr !== undefined
                        ? `<div style="margin-top: 8px; font-size: 12px; font-weight: 700; color: #122134; background-color: #ECFDF5; display: inline-block; padding: 5px 14px; border-radius: 8px; border: 1px solid #A7F3D0;">
                            New Available Balance: <span style="font-family: monospace; font-weight: 800; color: #059669;">₹${balanceStr}</span>
                          </div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>

              <!-- Transaction Summary Table with Proper Row Gaps for Mobile -->
              <div style="font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
                Transaction Summary
              </div>
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 26px;">
                <!-- Row 1: Cyber Café / Organization -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Cyber Café / Organization</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 800; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${orgName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 2: Operator -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Operator</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${rawUserName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 3: Purpose / Service -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Purpose / Service</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${service}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 4: Order ID -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Order ID</td>
                        <td width="62%" style="font-size: 12px; color: #122134; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-all;">${orderId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 5: Payment Ref / Txn ID -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Payment Ref / Txn ID</td>
                        <td width="62%" style="font-size: 12px; color: #122134; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-all;">${txnId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 6: Payment Method -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Payment Method</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 600; line-height: 1.4; text-align: right; vertical-align: middle;">${mode}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 7: Date & Time -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Date &amp; Time</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 600; line-height: 1.4; text-align: right; vertical-align: middle;">${dateStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Nagrik Orange Signature Action Button -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="https://nagriksevapoint.in/dashboard" target="_blank" style="display: inline-block; background-color: #FD3820; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 34px; border-radius: 12px; box-shadow: 0 4px 10px rgba(253, 56, 32, 0.25);">
                      Open Dashboard &bull; Launch Services &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Official Website Matched Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #CBD5E1; padding: 22px 32px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.6;">
              <div style="font-weight: 800; color: #122134; margin-bottom: 4px;">
                Nagrik Seva Point &bull; Digital Infrastructure for Cyber Cafés &amp; CSC Desks
              </div>
              <div style="margin-bottom: 6px;">
                Website: <a href="https://nagriksevapoint.in" style="color: #FD3820; text-decoration: none; font-weight: 700;">nagriksevapoint.in</a>
                &nbsp;&bull;&nbsp;
                Helpdesk: <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; text-decoration: none; font-weight: 700;">nagriksevapoint@gmail.com</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                &copy; ${new Date().getFullYear()} Nagrik Seva Point. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `
NAGRIK SEVA POINT - PAYMENT SUCCESSFUL
========================================
${greeting}

Your payment of Rs.${amountStr} for ${orgName} has been successfully processed and credited to your Nagrik Seva Point wallet.

TRANSACTION DETAILS:
- Cyber Café / Organization: ${orgName}
- Operator: ${rawUserName}
- Service / Purpose: ${service}
- Amount: Rs.${amountStr}
${balanceStr ? `- New Available Balance: Rs.${balanceStr}\n` : ""}- Order ID: ${orderId}
- Transaction Reference: ${txnId}
- Payment Method: ${mode}
- Date & Time: ${dateStr}

Open your dashboard to continue: https://nagriksevapoint.in/dashboard

Regards,
Team Nagrik Seva Point
Website: https://nagriksevapoint.in | Helpdesk: nagriksevapoint@gmail.com
`;

    return { subject, html, text };
  }

  /**
   * Generates production-ready, mobile-responsive HTML for Payment Failed / Unsuccessful
   * Language: Professional English (with "Namaste {Name}" greeting)
   */
  public generateFailedEmailHtml(params: PaymentEmailFailedParams): { subject: string; html: string; text: string } {
    const rawUserName = params.userName || "Operator";
    const greeting = `Namaste ${this.formatGreetingName(rawUserName)},`;
    const orgName = params.orgName?.trim() || (rawUserName !== "Operator" ? `${rawUserName}'s Cyber Café` : "Cyber Café");
    const amountStr = Number(params.amount || 0).toFixed(2);
    const dateStr = params.failedAt || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const orderId = params.orderId || "CF_ORD_PREVIEW";
    const reason = params.errorMessage || "Transaction declined or timed out by issuing bank / UPI application.";

    const subject = `Payment Unsuccessful (₹${amountStr}) - Nagrik Seva Point`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #122134;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #CBD5E1; box-shadow: 0 4px 16px rgba(18, 33, 52, 0.06);">
          
          <!-- Top Nagrik Orange Brand Stripe -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #FD3820 0%, #D92D16 100%);"></td>
          </tr>

          <!-- Core Header with Official Website Logo -->
          <tr>
            <td style="background-color: #FFFFFF; padding: 24px 32px 20px 32px; text-align: center; border-bottom: 1px solid #E2E8F0;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://nagriksevapoint.in" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="https://nagriksevapoint.in/logo.png" alt="Nagrik Seva Point" width="220" style="display: block; border: 0; outline: none; text-decoration: none; max-width: 220px; height: auto; margin: 0 auto;" />
                    </a>
                    <div style="font-size: 11px; font-weight: 700; color: #FD3820; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 8px;">
                      Payment Notification Status
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Failure Alert Ribbon -->
          <tr>
            <td style="background-color: #FEF2F2; border-bottom: 1px solid #FEE2E2; padding: 13px 24px; text-align: center;">
              <div style="display: inline-block; vertical-align: middle;">
                <span style="display: inline-block; background-color: #DC2626; color: #FFFFFF; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 8px;">
                  ✕ Payment Incomplete
                </span>
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px 24px 32px;">
              <!-- Greeting with 'Namaste {Name}i' -->
              <h1 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; color: #122134;">
                ${greeting}
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Your payment attempt of <strong style="color: #122134;">₹${amountStr}</strong> for <strong style="color: #122134;">${orgName}</strong> could not be completed due to a bank decline or technical timeout.
              </p>

              <!-- Reassurance: 100% Instant Wallet Refund Guarantee -->
              <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 18px 20px; margin-bottom: 22px;">
                <div style="font-size: 13px; font-weight: 800; color: #065F46; margin-bottom: 6px;">
                  🛡️ 100% Instant Wallet Refund Guarantee
                </div>
                <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6; color: #047857;">
                  अगर आपकी पैन फाइंड नहीं होती है या वेरिफिकेशन असफल रहता है, तो आपके वॉलेट से कटी हुई राशि (<strong>₹${amountStr}</strong>) <strong>100% ऑटोमैटिकली आपके वॉलेट में तुरंत (Instant Refund) वापस जमा</strong> कर दी जाएगी।
                </p>
                <div style="font-size: 11.5px; color: #065F46; line-height: 1.5;">
                  &bull; <strong>Wallet Transactions:</strong> Instant 100% credit back to your Cyber Café Wallet balance.<br />
                  &bull; <strong>UPI / Gateway Attempts:</strong> If debited via bank/UPI, the bank auto-reverses to source account within 24–48 hours.
                </div>
              </div>

              <!-- How to Access Transaction Details Card -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px 20px; margin-bottom: 22px;">
                <div style="font-size: 12px; font-weight: 800; color: #122134; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px;">
                  📋 How to Access Transaction &amp; Passbook Ledger
                </div>
                <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: #475569;">
                  You can verify this transaction status and check your passbook ledger history anytime from your dashboard:
                </p>
                <div style="font-size: 12px; line-height: 1.7; color: #122134;">
                  1. Visit <a href="https://nagriksevapoint.in/dashboard/transactions" target="_blank" style="color: #FD3820; font-weight: 700; text-decoration: none;">Passbook &amp; Transaction History</a><br />
                  2. Search using Order ID: <code style="font-family: monospace; background-color: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${orderId}</code><br />
                  3. Filter by <strong>Refunds (↺)</strong> to view the instant wallet credit timestamp.
                </div>
              </div>

              <!-- Failure Details Table with Proper Row Gaps for Mobile -->
              <div style="font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
                Attempt Summary
              </div>
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 26px;">
                <!-- Row 1: Cyber Café / Organization -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Cyber Café / Organization</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 800; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${orgName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 2: Operator -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Operator</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${rawUserName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 3: Attempted Amount -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Attempted Amount</td>
                        <td width="58%" style="font-size: 14px; color: #DC2626; font-weight: 800; font-family: monospace; line-height: 1.4; text-align: right; vertical-align: middle;">₹${amountStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 4: Order ID -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Order ID</td>
                        <td width="62%" style="font-size: 12px; color: #122134; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-all;">${orderId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 5: Refund Protection -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Refund Protection</td>
                        <td width="62%" style="font-size: 12px; color: #059669; font-weight: 700; line-height: 1.4; text-align: right; vertical-align: middle;">100% Auto-Refunded to Wallet</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 6: Failure Reason -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Failure Reason</td>
                        <td width="62%" style="font-size: 12px; color: #991B1B; font-weight: 600; line-height: 1.4; text-align: right; vertical-align: middle; word-break: break-word;">${reason}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td height="8" style="font-size: 8px; line-height: 8px; height: 8px;">&nbsp;</td></tr>

                <!-- Row 7: Date & Time -->
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 13px 16px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size: 13px; color: #64748B; font-weight: 600; line-height: 1.4; vertical-align: middle;">Date &amp; Time</td>
                        <td width="58%" style="font-size: 13px; color: #122134; font-weight: 600; line-height: 1.4; text-align: right; vertical-align: middle;">${dateStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Dual Action Buttons: Passbook & Dashboard -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="https://nagriksevapoint.in/dashboard/transactions" target="_blank" style="display: inline-block; background-color: #122134; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; margin-right: 8px; margin-bottom: 8px;">
                      View Passbook &amp; Ledger &rarr;
                    </a>
                    <a href="https://nagriksevapoint.in/dashboard" target="_blank" style="display: inline-block; background-color: #FD3820; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; margin-bottom: 8px;">
                      Try Again in Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Support Note -->
              <p style="margin: 0; font-size: 12px; color: #64748B; text-align: center; line-height: 1.5;">
                Need help with your transaction? Write directly to our support team at <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; font-weight: 700; text-decoration: none;">nagriksevapoint@gmail.com</a>.
              </p>
            </td>
          </tr>

          <!-- Official Website Matched Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #CBD5E1; padding: 22px 32px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.6;">
              <div style="font-weight: 800; color: #122134; margin-bottom: 4px;">
                Nagrik Seva Point &bull; Digital Infrastructure for Cyber Cafés &amp; CSC Desks
              </div>
              <div style="margin-bottom: 6px;">
                Website: <a href="https://nagriksevapoint.in" style="color: #FD3820; text-decoration: none; font-weight: 700;">nagriksevapoint.in</a>
                &nbsp;&bull;&nbsp;
                Helpdesk: <a href="mailto:nagriksevapoint@gmail.com" style="color: #FD3820; text-decoration: none; font-weight: 700;">nagriksevapoint@gmail.com</a>
              </div>
              <div style="font-size: 11px; color: #94A3B8;">
                &copy; ${new Date().getFullYear()} Nagrik Seva Point. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `
NAGRIK SEVA POINT - PAYMENT UNSUCCESSFUL
==========================================
${greeting}

Your payment attempt of Rs.${amountStr} for ${orgName} could not be completed.

REASON: ${reason}

AUTOMATIC BANK REVERSAL GUARANTEE:
If any amount was debited from your bank account or UPI app, it will be automatically reversed back to your source account within 24-48 hours as per banking regulations.

TRANSACTION DETAILS:
- Cyber Café / Organization: ${orgName}
- Operator: ${rawUserName}
- Order ID: ${orderId}
- Date & Time: ${dateStr}

To retry your payment, visit your dashboard:
https://nagriksevapoint.in/dashboard

Regards,
Team Nagrik Seva Point
Website: https://nagriksevapoint.in | Helpdesk: nagriksevapoint@gmail.com
`;

    return { subject, html, text };
  }

  /**
   * Dispatches Payment Success Email to recipient.
   */
  async notifyPaymentSuccess(params: PaymentEmailSuccessParams): Promise<{ success: boolean; previewOnly: boolean; messageId?: string }> {
    const { subject, html, text } = this.generateSuccessEmailHtml(params);

    try {
      const result = await brevoMailService.sendEmail({
        to: [{ email: params.to, name: params.userName || params.orgName }],
        subject,
        htmlContent: html,
        textContent: text,
      });

      logger.info(
        `[PaymentEmail - SENT] Payment SUCCESS email sent to ${params.to} (MessageId: ${result.messageId || "ok"})`
      );

      return {
        success: result.success,
        previewOnly: false,
        messageId: result.messageId,
      };
    } catch (err: any) {
      logger.error(`[PaymentEmail] Error sending SUCCESS email to ${params.to}: ${err.message}`);
      return { success: false, previewOnly: false };
    }
  }

  /**
   * Dispatches Payment Failed Email to recipient.
   */
  async notifyPaymentFailed(params: PaymentEmailFailedParams): Promise<{ success: boolean; previewOnly: boolean; messageId?: string }> {
    const { subject, html, text } = this.generateFailedEmailHtml(params);

    try {
      const result = await brevoMailService.sendEmail({
        to: [{ email: params.to, name: params.userName || params.orgName }],
        subject,
        htmlContent: html,
        textContent: text,
      });

      logger.info(
        `[PaymentEmail - SENT] Payment FAILED email sent to ${params.to} (MessageId: ${result.messageId || "ok"})`
      );

      return {
        success: result.success,
        previewOnly: false,
        messageId: result.messageId,
      };
    } catch (err: any) {
      logger.error(`[PaymentEmail] Error sending FAILED email to ${params.to}: ${err.message}`);
      return { success: false, previewOnly: false };
    }
  }
}

export const paymentEmailService = new PaymentEmailService();
