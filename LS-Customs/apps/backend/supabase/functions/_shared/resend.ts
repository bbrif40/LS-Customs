/**
 * Shared Resend Email Client & Receipt Template Builder
 *
 * Sends transactional receipt emails to customers via Resend (https://resend.com).
 * Includes luxury brand styling, warm booking acknowledgment, receipt summary card,
 * and direct links to the LS Customs Help Center (https://ls-customs-web.vercel.app/help).
 */

export interface ReceiptEmailData {
  customerName: string;
  customerEmail: string;
  bookingId: string;
  bookingType: "rental" | "service" | "general" | string;
  itemTitle?: string;
  serviceCategory?: string;
  amount?: number | string;
  scheduledDate?: string;
  location?: string;
  paymentMethod?: string;
  status?: string;
}

export interface SendEmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

const DEFAULT_FROM = "LS Customs <onboarding@resend.dev>";
const HELP_CENTER_URL = "https://ls-customs-web.vercel.app/help";

import * as nodemailer from "https://esm.sh/nodemailer@6.9.14";

/**
 * Sends any email via Gmail (Nodemailer) instead of Resend API for free sending.
 */
export async function sendResendEmail(
  options: SendEmailOptions,
  apiKeyOverride?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  // We grab the Gmail credentials from environment/secrets
  const user = (typeof Deno !== "undefined" ? Deno.env.get("GMAIL_USER") : undefined) || (typeof process !== "undefined" ? process.env?.GMAIL_USER : undefined);
  const pass = (typeof Deno !== "undefined" ? Deno.env.get("GMAIL_PASSWORD") : undefined) || (typeof process !== "undefined" ? process.env?.GMAIL_PASSWORD : undefined);

  if (!user || !pass) {
    console.error("[email] GMAIL_USER or GMAIL_PASSWORD is not configured in secrets.");
    return { success: false, error: "Missing Gmail credentials" };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass,
    }
  });

  const toList = Array.isArray(options.to) ? options.to : [options.to];

  try {
    const info = await transporter.sendMail({
      from: `LS Customs <${user}>`,
      to: toList,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    
    console.log("Email sent successfully:", info.messageId);
    return { success: true, id: info.messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Builds a beautiful, responsive, accommodating HTML receipt email for customers.
 */
export function buildReceiptEmailHtml(data: ReceiptEmailData): string {
  const {
    customerName,
    bookingId,
    bookingType,
    itemTitle = "Automotive Care Service",
    amount,
    scheduledDate = "As Scheduled",
    location = "On-site / Preferred Location",
    status = "Confirmed & Acknowledged",
  } = data;

  const typeLabel =
    bookingType.toLowerCase() === "rental"
      ? "Vehicle Rental"
      : bookingType.toLowerCase() === "service"
      ? "Mobile Mechanic Service"
      : "Automotive Booking";

  const formattedAmount =
    amount !== undefined
      ? typeof amount === "number"
        ? `₱${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
        : `₱${amount}`
      : "Paid in Full";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LS Customs Booking Confirmation & Receipt</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f1c1d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e5ede8;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0f1c1d;
      padding: 36px 12px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #172a2c;
      border: 1px solid rgba(232, 191, 103, 0.22);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    }
    .header {
      background: linear-gradient(135deg, #1b3838 0%, #112527 100%);
      padding: 32px 36px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
    }
    .brand-eyebrow {
      color: #e8bf67;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0 0 6px;
    }
    .brand-title {
      color: #ffffff;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .body {
      padding: 32px 36px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 14px;
    }
    .lead-text {
      font-size: 14px;
      line-height: 1.65;
      color: #b7cbbf;
      margin: 0 0 24px;
    }
    .receipt-card {
      background-color: #1f3739;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 22px;
      margin-bottom: 26px;
    }
    .receipt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .receipt-badge {
      display: inline-block;
      background: #dfefe3;
      color: #24573b;
      font-weight: 700;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .receipt-ref {
      font-size: 12px;
      color: #9bb7aa;
      font-family: monospace;
    }
    .receipt-item-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 14px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .detail-label {
      color: #8da598;
    }
    .detail-value {
      color: #ffffff;
      font-weight: 600;
      text-align: right;
    }
    .detail-total {
      font-size: 16px;
      color: #e8bf67;
      font-weight: 800;
    }
    .next-steps-card {
      background: rgba(232, 191, 103, 0.06);
      border-left: 3px solid #e8bf67;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 28px;
    }
    .next-steps-title {
      font-size: 13px;
      font-weight: 700;
      color: #e8bf67;
      margin: 0 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .next-steps-body {
      font-size: 13px;
      line-height: 1.55;
      color: #cad8cf;
      margin: 0;
    }
    .help-section {
      background-color: #122123;
      border-radius: 10px;
      padding: 24px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .help-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 8px;
    }
    .help-copy {
      font-size: 13px;
      line-height: 1.6;
      color: #9cb4a7;
      margin: 0 0 18px;
    }
    .help-button {
      display: inline-block;
      background-color: #e8bf67;
      color: #112022 !important;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 7px;
      letter-spacing: 0.3px;
      transition: background-color 0.2s ease;
    }
    .help-link-subtext {
      display: block;
      margin-top: 10px;
      font-size: 11px;
      color: #7b9588;
      word-break: break-all;
    }
    .help-link-subtext a {
      color: #e8bf67;
      text-decoration: none;
    }
    .footer {
      background-color: #0c1718;
      padding: 22px 36px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    .footer p {
      font-size: 11px;
      line-height: 1.6;
      color: #6d8579;
      margin: 0;
    }
    @media only screen and (max-width: 600px) {
      .header, .body, .footer {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <p class="brand-eyebrow">LS Customs Concierge</p>
        <h1 class="brand-title">Booking Confirmation & Receipt</h1>
      </div>

      <!-- Main Body -->
      <div class="body">
        <p class="greeting">Hello ${customerName || "Valued Customer"},</p>
        <p class="lead-text">
          Thank you for choosing <strong>LS Customs</strong>! Our system has officially received and acknowledged your 
          <strong>${typeLabel}</strong>. Everything has been registered in our schedule and our team is standing by to serve you.
        </p>

        <!-- Receipt Card -->
        <div class="receipt-card">
          <div class="receipt-header">
            <span class="receipt-badge">${status}</span>
            <span class="receipt-ref">ID: #${bookingId}</span>
          </div>

          <h3 class="receipt-item-title">${itemTitle}</h3>

          <div class="detail-row">
            <span class="detail-label">Service / Booking Type</span>
            <span class="detail-value">${typeLabel}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Schedule</span>
            <span class="detail-value">${scheduledDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Location / Hub</span>
            <span class="detail-value">${location}</span>
          </div>
          <div class="detail-row" style="margin-top: 8px; padding-top: 10px; border-top: 1px dashed rgba(255, 255, 255, 0.15);">
            <span class="detail-label detail-total">Total Amount</span>
            <span class="detail-value detail-total">${formattedAmount}</span>
          </div>
        </div>

        <!-- Next Steps -->
        <div class="next-steps-card">
          <p class="next-steps-title">What happens next?</p>
          <p class="next-steps-body">
            Our certified specialists and mobile mechanics are preparing for your appointment. 
            You can track your appointment progress, vehicle details, or assigned dispatch at any time directly through your dashboard.
          </p>
        </div>

        <!-- Help & Guidance Section -->
        <div class="help-section">
          <h4 class="help-title">Need Guidance or Have Questions?</h4>
          <p class="help-copy">
            We are dedicated to providing you with the best automotive care. If you have any inquiries, 
            need special instructions, or want guidance regarding your reservation, visit our Help Center:
          </p>
          <a href="${HELP_CENTER_URL}" class="help-button" target="_blank" rel="noopener noreferrer">
            Visit LS Customs Help Center &rarr;
          </a>
          <span class="help-link-subtext">
            Or copy this link: <a href="${HELP_CENTER_URL}" target="_blank">${HELP_CENTER_URL}</a>
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>
          &copy; 2026 LS Customs Automotive &amp; Fleet Concierge. All rights reserved.<br />
          Precision service. Premium vehicles. On-demand care.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Convenience helper to send a structured receipt email for a booking.
 */
export async function sendResendReceipt(
  data: ReceiptEmailData,
  apiKeyOverride?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const subject = `LS Customs Receipt — ${data.bookingType === "rental" ? "Rental" : "Service"} #${data.bookingId}`;
  const html = buildReceiptEmailHtml(data);
  const text = `LS Customs Booking Confirmation & Receipt\n\nHello ${data.customerName},\n\nThank you for choosing LS Customs! Your ${data.bookingType} (ID: #${data.bookingId}) has been acknowledged.\n\nItem: ${data.itemTitle || "Service"}\nAmount: ${data.amount || "Paid"}\nSchedule: ${data.scheduledDate || "As Scheduled"}\n\nHave questions or need guidance? Visit our Help Center at ${HELP_CENTER_URL}`;

  return await sendResendEmail(
    {
      to: data.customerEmail,
      subject,
      html,
      text,
    },
    apiKeyOverride,
  );
}
