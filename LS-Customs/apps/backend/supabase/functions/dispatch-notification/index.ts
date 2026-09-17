/**
 * Edge Function: dispatch-notification
 *
 * Delivers notification rows or direct SMS requests to external channels (SMS / Email).
 *
 * Supports:
 * 1. Twilio SMS (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
 * 2. TextBee SMS Gateway (TEXTBEE_API_KEY, optional TEXTBEE_DEVICE_ID)
 * 3. Semaphore SMS for Philippines (SEMAPHORE_API_KEY, optional SEMAPHORE_SENDER_NAME)
 * 4. SendGrid Email (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)
 * 5. Diagnostic / Simulated Fallback logging when providers are not yet configured in cloud.
 *
 * Triggers:
 * - Invoked by client/admin on mechanic assignment
 * - Invoked by DB webhook on notifications INSERT
 * - Direct invocation with { phone, message } or { notification_id }
 */

import { createServiceClient } from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface DispatchNotificationRequest {
  notification_id?: string;
  phone?: string;
  message?: string;
  user_id?: string;
  title?: string;
  mechanic_name?: string;
  mechanic_phone?: string;
  booking_id?: string;
}

interface DispatchNotificationResponse {
  notification_id?: string;
  dispatched: boolean;
  simulated?: boolean;
  channels: string[];
  recipient_phone?: string | null;
  message?: string;
  reason: string;
  errors?: string[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalizes phone numbers to standard E.164 international format (+639XXXXXXXXX).
 */
export function normalizePhoneNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip all non-digit and non-plus characters
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("63")) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("09") && cleaned.length === 11) {
    return `+63${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith("9") && cleaned.length === 10) {
    return `+63${cleaned}`;
  }
  return `+${cleaned}`;
}

/**
 * Helper to check if a secret is a placeholder
 */
function isRealSecret(val?: string | null): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed.includes("your-") || trimmed.includes("placeholder") || trimmed.startsWith("txb_your_")) {
    return false;
  }
  return true;
}

/**
 * Fetch a user's email from the GoTrue admin API.
 */
async function fetchUserEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/user?id=${userId}`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!res.ok) {
      console.warn(`Failed to fetch user ${userId} email: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.user?.email ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Error fetching user email:", msg);
    return null;
  }
}

/**
 * Send an email via SendGrid.
 */
async function sendEmail(
  to: string,
  from: string,
  subject: string,
  body: string,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], subject }],
        from: { email: from },
        content: [{ type: "text/plain", value: body }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Send an SMS via Twilio.
 */
async function sendSmsTwilio(
  to: string,
  from: string,
  body: string,
  sid: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${sid}:${token}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: body,
      }).toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Send an SMS via TextBee (https://textbee.dev).
 * Official Endpoint: https://api.textbee.dev/api/v1/gateway/send-sms
 * Header: x-api-key: <KEY>
 * Body: { recipients: ["+639..."], message: "..." }
 */
async function sendSmsTextBee(
  to: string,
  body: string,
  apiKey: string,
  deviceId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = deviceId
      ? `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`
      : `https://api.textbee.dev/api/v1/gateway/send-sms`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        recipients: [to],
        message: body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Send an SMS via Semaphore (Philippines SMS gateway: https://semaphore.co).
 */
async function sendSmsSemaphore(
  to: string,
  body: string,
  apiKey: string,
  senderName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apikey: apiKey,
        number: to,
        message: body,
        sender_name: senderName || "SEMAPHORE",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      return { success: false, error: `HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(null, {
      code: "VALIDATION_ERROR",
      message: "Method not allowed. Use POST.",
    }, 405);
  }

  try {
    const body: DispatchNotificationRequest = await req.json().catch(() => ({}));

    const hasNotificationId = Boolean(body.notification_id && UUID_REGEX.test(body.notification_id));
    const hasDirectSms = Boolean(body.phone && body.message);

    if (!hasNotificationId && !hasDirectSms) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required fields: provide either notification_id or both phone and message",
      }, 400);
    }

    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let notification: Record<string, unknown> | null = null;
    let metadata: Record<string, unknown> = {};

    if (body.notification_id) {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, body, metadata")
        .eq("id", body.notification_id)
        .maybeSingle();

      if (!error && data) {
        notification = data;
        metadata = (data.metadata as Record<string, unknown>) ?? {};
      }
    }

    // Idempotency: check if already successfully dispatched
    if (metadata.dispatched === true) {
      console.log(`[dispatch-notification] Notification ${body.notification_id} already dispatched`);
      return jsonResponse({
        notification_id: body.notification_id,
        dispatched: true,
        channels: (metadata.channels_dispatched as string[]) ?? [],
        reason: "already_dispatched",
      } as DispatchNotificationResponse, null, 200);
    }

    // Resolve target recipient phone number
    let targetPhone = body.phone ?? null;
    const recipientUserId = (body.user_id || notification?.user_id) as string | undefined;

    if (!targetPhone && recipientUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", recipientUserId)
        .maybeSingle();

      if (profile?.phone) {
        targetPhone = profile.phone;
      }
    }

    if (!targetPhone && metadata.customer_phone) {
      targetPhone = String(metadata.customer_phone);
    }
    if (!targetPhone && metadata.phone) {
      targetPhone = String(metadata.phone);
    }

    const normalizedPhone = normalizePhoneNumber(targetPhone);
    const smsMessage = body.message || (notification?.body as string) || "LS Customs Notification";
    const notificationTitle = body.title || (notification?.title as string) || "Notification";

    const channels: string[] = [];
    const errors: string[] = [];
    let simulated = false;

    // --- 1. Email via SendGrid (if user_id exists) ---
    if (recipientUserId) {
      const email = await fetchUserEmail(supabaseUrl, serviceRoleKey, recipientUserId);
      const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
      const sendgridFrom = Deno.env.get("SENDGRID_FROM_EMAIL");

      if (email && isRealSecret(sendgridKey) && sendgridFrom) {
        const emailResult = await sendEmail(
          email,
          sendgridFrom,
          notificationTitle,
          smsMessage,
          sendgridKey!,
        );
        if (emailResult.success) {
          channels.push("email");
          console.log(`[dispatch-notification] Email sent to ${email}`);
        } else {
          errors.push(`email_failed: ${emailResult.error}`);
        }
      }
    }

    // --- 2. SMS Delivery Pipeline ---
    if (normalizedPhone) {
      const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
      const textbeeKey = Deno.env.get("TEXTBEE_API_KEY");
      const textbeeDeviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
      const semaphoreKey = Deno.env.get("SEMAPHORE_API_KEY");
      const semaphoreSender = Deno.env.get("SEMAPHORE_SENDER_NAME");

      let smsSent = false;

      // Option A: Semaphore (Philippines primary SMS gateway)
      if (isRealSecret(semaphoreKey)) {
        console.log(`[dispatch-notification] Attempting SMS dispatch via Semaphore to ${normalizedPhone}`);
        const result = await sendSmsSemaphore(normalizedPhone, smsMessage, semaphoreKey!, semaphoreSender);
        if (result.success) {
          channels.push("sms_semaphore");
          smsSent = true;
          console.log(`[dispatch-notification] Semaphore SMS delivered to ${normalizedPhone}`);
        } else {
          errors.push(`semaphore_failed: ${result.error}`);
          console.error(`[dispatch-notification] Semaphore error:`, result.error);
        }
      }

      // Option B: Twilio
      if (!smsSent && isRealSecret(twilioSid) && isRealSecret(twilioToken) && twilioFrom) {
        console.log(`[dispatch-notification] Attempting SMS dispatch via Twilio to ${normalizedPhone}`);
        const result = await sendSmsTwilio(normalizedPhone, twilioFrom, smsMessage, twilioSid!, twilioToken!);
        if (result.success) {
          channels.push("sms_twilio");
          smsSent = true;
          console.log(`[dispatch-notification] Twilio SMS delivered to ${normalizedPhone}`);
        } else {
          errors.push(`twilio_failed: ${result.error}`);
          console.error(`[dispatch-notification] Twilio error:`, result.error);
        }
      }

      // Option C: TextBee
      if (!smsSent && isRealSecret(textbeeKey)) {
        console.log(`[dispatch-notification] Attempting SMS dispatch via TextBee to ${normalizedPhone}`);
        const result = await sendSmsTextBee(normalizedPhone, smsMessage, textbeeKey!, textbeeDeviceId);
        if (result.success) {
          channels.push("sms_textbee");
          smsSent = true;
          console.log(`[dispatch-notification] TextBee SMS delivered to ${normalizedPhone}`);
        } else {
          errors.push(`textbee_failed: ${result.error}`);
          console.error(`[dispatch-notification] TextBee error:`, result.error);
        }
      }

      // Option D: Simulated Fallback (when no live carrier credentials are configured in Supabase secrets)
      if (!smsSent) {
        simulated = true;
        channels.push("simulated_sms");
        console.log(
          `[dispatch-notification] [SIMULATED SMS] Recipient: ${normalizedPhone} | Message: "${smsMessage}". ` +
          `To send live carrier SMS, configure SEMAPHORE_API_KEY, TWILIO_*, or TEXTBEE_API_KEY in Supabase secrets.`
        );
      }
    } else {
      errors.push("no_valid_phone_number");
      console.warn(`[dispatch-notification] No valid phone number provided for recipient`);
    }

    // --- 3. Update notification row metadata if notification exists ---
    if (notification && notification.id) {
      const updatedMetadata: Record<string, unknown> = {
        ...metadata,
        dispatched: channels.length > 0,
        simulated,
        dispatched_at: new Date().toISOString(),
        channels_dispatched: channels,
        recipient_phone: normalizedPhone,
      };

      if (errors.length > 0) {
        updatedMetadata.dispatch_errors = errors;
      }

      await supabase
        .from("notifications")
        .update({ metadata: updatedMetadata })
        .eq("id", notification.id);
    }

    const isSuccess = channels.length > 0;
    const responsePayload: DispatchNotificationResponse = {
      notification_id: (notification?.id as string) || body.notification_id,
      dispatched: isSuccess,
      simulated,
      channels,
      recipient_phone: normalizedPhone,
      message: smsMessage,
      reason: isSuccess ? (simulated ? "simulated_success" : "success") : "no_channels_succeeded",
      errors: errors.length > 0 ? errors : undefined,
    };

    return jsonResponse(responsePayload, null, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("dispatch-notification exception:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message,
    }, 500);
  }
});
