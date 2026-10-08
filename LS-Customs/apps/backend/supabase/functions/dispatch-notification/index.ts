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
import { getCorsHeaders, jsonResponse as baseJsonResponse } from "../_shared/cors.ts";

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
      signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
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
      return { success: false, error: `HTTP ${res.status}` };
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
      signal: AbortSignal.timeout(15000),
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
      return { success: false, error: `HTTP ${res.status}` };
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
      signal: AbortSignal.timeout(15000),
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
      return { success: false, error: `HTTP ${res.status}` };
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
      signal: AbortSignal.timeout(15000),
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
      return { success: false, error: `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (data: unknown, error: Parameters<typeof baseJsonResponse>[1], status = 200): Response =>
    baseJsonResponse(data, error, status, req);
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
    const rawBody: any = await req.json().catch(() => ({}));
    const record = rawBody.record ?? null;
    const notificationId = rawBody.notification_id || record?.id;
    const hasNotificationId = Boolean(notificationId && UUID_REGEX.test(notificationId));
    let rawPhone = rawBody.phone || record?.phone;
    let rawMessage = rawBody.message || rawBody.body || record?.body;
    const hasDirectSms = Boolean(rawPhone && rawMessage);

    if (!hasNotificationId && !hasDirectSms && !rawBody.booking_id && !record?.metadata?.booking_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required fields: provide either notification_id, phone & message, or booking_id",
      }, 400);
    }

    // ------------------------------------------------------------------
    // Authentication: accept service-role key OR admin JWT.
    // DB webhook invocations send the service-role key; admin panel sends JWT.
    // ------------------------------------------------------------------
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";

    let isAuthenticated = false;
    let ownerRestrictedId: string | undefined;

    // Check 1: Service-role key (DB webhook / trigger invocation)
    if (bearerToken && (bearerToken === supabaseServiceKey || bearerToken === Deno.env.get("NOTIFICATION_DISPATCH_TOKEN"))) {
      isAuthenticated = true;
    }

    // Check 2: Admin JWT
    if (!isAuthenticated && bearerToken) {
      const supabaseTmp = createServiceClient();
      const { data: authUser } = await supabaseTmp.auth.getUser(bearerToken);
      if (authUser?.user) {
        const { data: callerProfile } = await supabaseTmp
          .from("profiles")
          .select("role")
          .eq("id", authUser.user.id)
          .maybeSingle();
        if (callerProfile?.role === "admin") {
          isAuthenticated = true;
        } else if (hasNotificationId) {
          isAuthenticated = true;
          ownerRestrictedId = authUser.user.id;
        }
      }
    }

    // Payload shape does not authenticate a webhook. Only verified credentials do.

    if (!isAuthenticated) {
      return jsonResponse(null, {
        code: "UNAUTHENTICATED",
        message: "Authentication required: provide a service-role key or admin JWT",
      }, 401);
    }

    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let notification: Record<string, unknown> | null = null;
    let metadata: Record<string, unknown> = (rawBody.metadata || record?.metadata || {}) as Record<string, unknown>;

    if (notificationId) {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, body, metadata")
        .eq("id", notificationId)
        .maybeSingle();

      if (!error && data) {
        notification = data;
        metadata = {
          ...metadata,
          ...((data.metadata as Record<string, unknown>) ?? {}),
        };
      }
    }

    if (ownerRestrictedId) {
      if (!notification || notification.user_id !== ownerRestrictedId)
        return jsonResponse(null, { code: "FORBIDDEN", message: "Notification access denied" }, 403);
      // Customer retries use only the original server-generated content/recipient.
      rawPhone = undefined;
      rawMessage = undefined;
      metadata = (notification.metadata as Record<string, unknown>) ?? {};
    }

    // Idempotency: check if already successfully dispatched
    if (metadata.dispatched === true && metadata.simulated !== true && metadata.delivery_state !== "failed") {
      console.log(`[dispatch-notification] Notification ${notificationId} already dispatched`);
      return jsonResponse({
        notification_id: notificationId,
        dispatched: true,
        channels: (metadata.channels_dispatched as string[]) ?? [],
        reason: "already_dispatched",
      } as DispatchNotificationResponse, null, 200);
    }

    if (notification?.id) {
      const { data: reserved, error: reservationError } = await supabase.rpc('reserve_notification_dispatch', { p_id: notification.id });
      if (reservationError) throw new Error('Notification reservation failed');
      if (!reserved) return jsonResponse({ dispatched: false, simulated: false, channels: [], reason: 'in_progress' }, null, 202);
    }

    // Resolve target recipient phone number
    let targetPhone = rawPhone ?? null;
    const recipientUserId = (notification?.user_id || rawBody.user_id || record?.user_id) as string | undefined;

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

    // Fallback: check booking for customer phone if still unresolved
    const bookingId = rawBody.booking_id || metadata.booking_id || record?.metadata?.booking_id;
    if (!targetPhone && bookingId) {
      const { data: sb } = await supabase
        .from("service_bookings")
        .select("customer_id")
        .eq("id", bookingId)
        .maybeSingle();

      if (sb?.customer_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", sb.customer_id)
          .maybeSingle();
        if (prof?.phone) {
          targetPhone = prof.phone;
        }
      }

      if (!targetPhone) {
        const { data: vb } = await supabase
          .from("vehicle_bookings")
          .select("customer_id")
          .eq("id", bookingId)
          .maybeSingle();

        if (vb?.customer_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("phone")
            .eq("id", vb.customer_id)
            .maybeSingle();
          if (prof?.phone) {
            targetPhone = prof.phone;
          }
        }
      }
    }

    const normalizedPhone = normalizePhoneNumber(targetPhone);
    const smsMessage = rawMessage || (notification?.body as string) || "LS Customs: Your booking status has been updated.";
    const notificationTitle = notification?.title || rawBody.title || record?.title || "Notification";

    const channels: string[] = metadata.simulated !== true && Array.isArray(metadata.channels_dispatched)
      ? metadata.channels_dispatched.filter((channel): channel is string => typeof channel === "string") : [];
    const errors: string[] = [];
    const simulated = false;

    // --- 1. Email via SendGrid (if user_id exists) ---
    if (recipientUserId && !channels.includes("email")) {
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
          console.log("[dispatch-notification] Email accepted");
        } else {
          errors.push(`email_failed: ${emailResult.error}`);
        }
      }
    }

    // --- 2. SMS Delivery Pipeline ---
    // User requirement: Only send SMS when status is assigned, rest no.
    const isAssigned =
      metadata.new_status === "assigned" ||
      metadata.dispatch_sms === true ||
      metadata.dispatch_sms === "true" ||
      String(notificationTitle || "").toLowerCase().includes("assign") ||
      String(rawMessage || "").toLowerCase().includes("assigned");

    if (normalizedPhone && isAssigned && !channels.some(channel => channel.startsWith("sms_"))) {
      const textbeeKey = Deno.env.get("TEXTBEE_API_KEY");
      const textbeeDeviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
      const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
      const semaphoreKey = Deno.env.get("SEMAPHORE_API_KEY");
      const semaphoreSender = Deno.env.get("SEMAPHORE_SENDER_NAME");

      let smsSent = false;

      // Option A: TextBee (Primary SMS Gateway Device)
      if (isRealSecret(textbeeKey)) {
        console.log("[dispatch-notification] SMS provider request");
        const result = await sendSmsTextBee(normalizedPhone, smsMessage, textbeeKey!, textbeeDeviceId);
        if (result.success) {
          channels.push("sms_textbee");
          smsSent = true;
          console.log("[dispatch-notification] SMS provider request");
        } else {
          errors.push(`textbee_failed: ${result.error}`);
          console.error("[dispatch-notification] TextBee provider request failed");
        }
      }

      // Option B: Semaphore (Philippines SMS gateway)
      if (!smsSent && isRealSecret(semaphoreKey)) {
        console.log("[dispatch-notification] SMS provider request");
        const result = await sendSmsSemaphore(normalizedPhone, smsMessage, semaphoreKey!, semaphoreSender);
        if (result.success) {
          channels.push("sms_semaphore");
          smsSent = true;
          console.log("[dispatch-notification] SMS provider request");
        } else {
          errors.push(`semaphore_failed: ${result.error}`);
          console.error("[dispatch-notification] Semaphore provider request failed");
        }
      }

      // Option C: Twilio
      if (!smsSent && isRealSecret(twilioSid) && isRealSecret(twilioToken) && twilioFrom) {
        console.log("[dispatch-notification] SMS provider request");
        const result = await sendSmsTwilio(normalizedPhone, twilioFrom, smsMessage, twilioSid!, twilioToken!);
        if (result.success) {
          channels.push("sms_twilio");
          smsSent = true;
          console.log("[dispatch-notification] SMS provider request");
        } else {
          errors.push(`twilio_failed: ${result.error}`);
          console.error("[dispatch-notification] Twilio provider request failed");
        }
      }

      if (!smsSent) errors.push('sms_not_accepted');
    } else if (normalizedPhone && !isAssigned) {
      console.log("[dispatch-notification] SMS skipped for non-assignment event");
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
        dispatch_started_at: null,
        delivery_state: channels.some(channel => channel.startsWith("sms_")) ? "accepted" : (isAssigned ? "failed" : "skipped"),
        channels_dispatched: channels,
        recipient_phone: normalizedPhone,
      };

      if (errors.length > 0) {
        updatedMetadata.dispatch_errors = errors;
      }

      const { error: metadataError } = await supabase
        .from("notifications")
        .update({ metadata: updatedMetadata })
        .eq("id", notification.id);
      if (metadataError) throw new Error("Delivery outcome could not be recorded");
    }

    const isSuccess = channels.length > 0;
    const responsePayload: DispatchNotificationResponse = {
      notification_id: (notification?.id as string) || notificationId,
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
