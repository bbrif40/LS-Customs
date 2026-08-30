/**
 * Edge Function: dispatch-notification
 *
 * Delivers unsent notification rows to an external channel (email/SMS).
 *
 * For each notification_id received:
 * - Fetches the notification row and recipient profile (phone, full_name).
 * - Fetches the recipient's email address from auth.users via the GoTrue
 *   admin API (uses the injected service_role key).
 * - Sends an email via SendGrid if an email address is available.
 * - Sends an SMS via Twilio if a phone number is available.
 * - Updates the notification row's metadata JSONB with dispatch results
 *   (dispatched, dispatched_at, channels_dispatched) for idempotency.
 *
 * Trigger: Called by a DB webhook on notifications INSERT, or invoked
 * directly by the notify_on_status_change trigger via pg_net.
 *
 * Auth: Service role only — no JWT verification. This function is invoked
 * server-to-server, not by an end-user client.
 *
 * API contract: API.md §2.4
 */

import { createServiceClient } from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface DispatchNotificationRequest {
  notification_id: string;
}

interface DispatchNotificationResponse {
  notification_id: string;
  dispatched: boolean;
  channels: string[];
  reason: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch a user's email from the GoTrue admin API.
 * Uses the service_role key that is auto-injected into the function env.
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
        personalizations: [
          {
            to: [{ email: to }],
            subject: subject,
          },
        ],
        from: { email: from },
        content: [
          {
            type: "text/plain",
            value: body,
          },
        ],
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
async function sendSms(
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
    // ------------------------------------------------------------------
    // 1. Parse and validate request body
    // ------------------------------------------------------------------
    const body: DispatchNotificationRequest = await req.json().catch(() => null);
    if (!body || !body.notification_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required field: notification_id",
      }, 400);
    }

    if (!UUID_REGEX.test(body.notification_id)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "notification_id must be a valid UUID",
      }, 400);
    }

    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ------------------------------------------------------------------
    // 2. Fetch the notification row
    // ------------------------------------------------------------------
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, metadata")
      .eq("id", body.notification_id)
      .single();

    if (fetchError || !notification) {
      return jsonResponse(null, {
        code: "NOT_FOUND",
        message: `Notification ${body.notification_id} not found`,
      }, 404);
    }

    // ------------------------------------------------------------------
    // 3. Idempotency check — if already dispatched, return early
    // ------------------------------------------------------------------
    const metadata: Record<string, unknown> =
      (notification.metadata as Record<string, unknown>) ?? {};

    if (metadata.dispatched === true) {
      console.log(
        `[dispatch-notification] Notification ${notification.id} already dispatched on channels: ${
          (metadata.channels_dispatched as string[] | undefined) ?? []
        }`,
      );
      return jsonResponse({
        notification_id: notification.id,
        dispatched: true,
        channels: (metadata.channels_dispatched as string[]) ?? [],
        reason: "already_dispatched",
      } as DispatchNotificationResponse, null, 200);
    }

    // ------------------------------------------------------------------
    // 4. Fetch recipient profile (phone, full_name)
    // ------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", notification.user_id)
      .single();

    if (profileError || !profile) {
      console.error(
        "Failed to fetch recipient profile:",
        profileError?.message ?? "no profile found",
      );
    }

    // ------------------------------------------------------------------
    // 5. Fetch recipient email from auth.users (GoTrue admin API)
    //    Done regardless of profile status — email lives in auth.users.
    // ------------------------------------------------------------------
    const email = await fetchUserEmail(supabaseUrl, serviceRoleKey, notification.user_id);

    // ------------------------------------------------------------------
    // 6. Dispatch notifications to available channels
    // ------------------------------------------------------------------
    const channels: string[] = [];
    const errors: string[] = [];

    // --- Email via SendGrid ---
    if (email) {
      const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
      const sendgridFrom = Deno.env.get("SENDGRID_FROM_EMAIL");

      if (sendgridKey && sendgridFrom) {
        const result = await sendEmail(
          email,
          sendgridFrom,
          notification.title,
          notification.body,
          sendgridKey,
        );
        if (result.success) {
          channels.push("email");
          console.log(`[dispatch-notification] Email sent to ${email} for notification ${notification.id}`);
        } else {
          errors.push(`email_failed: ${result.error}`);
          console.error("SendGrid delivery failed:", result.error);
        }
      } else {
        console.warn("SendGrid not configured — skipping email delivery");
      }
    }

    // --- SMS via Twilio ---
    if (profile?.phone) {
      const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");

      if (twilioSid && twilioToken && twilioFrom) {
        const result = await sendSms(
          profile.phone,
          twilioFrom,
          notification.body,
          twilioSid,
          twilioToken,
        );
        if (result.success) {
          channels.push("sms");
          console.log(`[dispatch-notification] SMS sent to ${profile.phone} for notification ${notification.id}`);
        } else {
          errors.push(`sms_failed: ${result.error}`);
          console.error("Twilio delivery failed:", result.error);
        }
      } else {
        console.warn("Twilio not configured — skipping SMS delivery");
      }
    }

    // ------------------------------------------------------------------
    // 7. Update notification metadata with dispatch results
    // ------------------------------------------------------------------
    const updatedMetadata: Record<string, unknown> = {
      ...metadata,
      dispatched: channels.length > 0,
      dispatched_at: new Date().toISOString(),
      channels_dispatched: channels,
    };

    if (errors.length > 0) {
      updatedMetadata.dispatch_errors = errors;
    }

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ metadata: updatedMetadata })
      .eq("id", notification.id);

    if (updateError) {
      // Log but don't fail — the dispatch already happened, we just couldn't
      // record it in metadata. The caller gets the dispatch result below.
      console.error("Failed to update notification metadata:", updateError.message);
    }

    // ------------------------------------------------------------------
    // 8. Return response
    // ------------------------------------------------------------------
    if (channels.length === 0) {
      const hasNoContactInfo = !email && !profile?.phone;
      const reason = hasNoContactInfo
        ? "no_contact_info"
        : "provider_not_configured";
      return jsonResponse({
        notification_id: notification.id,
        dispatched: false,
        channels: [],
        reason,
      } as DispatchNotificationResponse, null, 200);
    }

    return jsonResponse({
      notification_id: notification.id,
      dispatched: true,
      channels,
      reason: "success",
    } as DispatchNotificationResponse, null, 200);

  } catch (err: unknown) {
    // Handle non-Error throws gracefully
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "INTERNAL_ERROR",
        message: errObj.message,
      }, errObj.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("dispatch-notification error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
