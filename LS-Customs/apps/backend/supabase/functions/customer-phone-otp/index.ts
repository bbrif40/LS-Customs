import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createServiceClient } from "../_shared/supabaseClient.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

// Public endpoint: possession of a one-time SMS challenge authorizes login.
// Account lookup, quotas, attempt limits and consumption stay server-side.
async function digest(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  // Rejection sampling avoids bias when converting a uint32 to six digits.
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= 4294000000);
  return (sample[0] % 1000000).toString().padStart(6, "0");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const respond = (data: unknown, error: Parameters<typeof jsonResponse>[1], status = 200): Response =>
    jsonResponse(data, error, status, req);
  if (req.method !== "POST") return respond(null, { code: "METHOD_NOT_ALLOWED", message: "Use POST." }, 405);
  try {
    let payload: unknown;
    try { payload = await req.json(); } catch {
      return respond(null, { code: "INVALID_REQUEST", message: "Invalid request." }, 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return respond(null, { code: "INVALID_REQUEST", message: "Invalid request." }, 400);
    const body = payload as Record<string, unknown>;
    const service = createServiceClient();
    const auth = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === "send") {
      const phone = typeof body.phone === "string" ? body.phone : "";
      if (!/^\+[1-9]\d{7,14}$/.test(phone) || typeof body.createAccount !== "boolean")
        return respond(null, { code: "INVALID_CONTACT", message: "Enter a valid international phone number." }, 400);
      const id = crypto.randomUUID(), code = randomCode();
      const { data, error } = await service.rpc("reserve_customer_phone_otp", {
        p_phone: phone, p_id: id, p_contact_hash: await digest(`phone:${phone}`),
        p_code_digest: await digest(`code:${id}:${code}`), p_create_user: body.createAccount,
      });
      if (error || !data?.[0]) throw new Error("OTP reservation failed");
      const reservation = data[0] as { challenge_id: string; delivery: string };
      if (reservation.delivery === "rate_limited")
        return respond(null, { code: "RATE_LIMITED", message: "Please wait before requesting another code. You can also sign in with email or Google." }, 429);
      if (reservation.delivery === "conflict")
        return respond(null, { code: "USE_EMAIL", message: "Please sign in with your email or Google to confirm your account's phone number." }, 409);
      if (reservation.delivery === "supabase") {
        const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 100) : "";
        const { error: sendError } = await auth.auth.signInWithOtp({ phone, options: {
          shouldCreateUser: body.createAccount,
          ...(body.createAccount && fullName ? { data: { full_name: fullName } } : {}),
        } });
        if (sendError) {
          console.error("[customer-phone-otp] Auth SMS request failed", sendError.code);
          return respond(null, { code: "SEND_FAILED", message: "We couldn't send a code. Try again later or sign in with email or Google." }, 400);
        }
        return respond({ verification: "sms" }, null);
      }

      // Read the eligible owner only from the service-only challenge record.
      const { data: challenge, error: readError } = await service.from("customer_phone_otp_challenges")
        .select("user_id").eq("id", id).single();
      if (readError) throw new Error("OTP challenge lookup failed");
      if (challenge?.user_id) {
        const apiKey = Deno.env.get("TEXTBEE_API_KEY"), deviceId = Deno.env.get("TEXTBEE_DEVICE_ID");
        if (!apiKey || !deviceId) throw new Error("SMS gateway unavailable");
        const response = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}/sendSMS`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ recipients: [phone], message: `Your LS Customs sign-in code is: ${code}. It expires in 10 minutes.` }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("SMS gateway rejected the request");
      }
      // Never disclose whether an unknown number has an account.
      return respond({ verification: "profile_phone", challengeId: id }, null);
    }

    if (body.action === "verify") {
      if (typeof body.challengeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.challengeId)
        || typeof body.code !== "string" || !/^\d{6}$/.test(body.code))
        return respond(null, { code: "INVALID_CODE", message: "Enter the six-digit code." }, 400);
      const { data: owner, error } = await service.rpc("consume_customer_phone_otp", {
        p_id: body.challengeId, p_code_digest: await digest(`code:${body.challengeId}:${body.code}`),
      });
      if (error) throw new Error("OTP verification failed");
      if (!owner) return respond(null, { code: "INVALID_CODE", message: "This code is invalid or expired. Try again, or use email or Google to sign in." }, 400);

      const { data: account, error: accountError } = await service.auth.admin.getUserById(owner);
      if (accountError || !account.user?.email || !account.user.email_confirmed_at)
        throw new Error("Original account unavailable");
      // Mint a normal Supabase session for the proved phone's original owner.
      // No auth user or profile is recreated, renamed, or merged.
      const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: account.user.email });
      if (linkError || link.user?.id !== owner || !link.properties?.hashed_token)
        throw new Error("Original account login unavailable");
      const { data: login, error: loginError } = await auth.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
      if (loginError || login.user?.id !== owner || !login.session) throw new Error("Original account session unavailable");
      return respond({ session: login.session }, null);
    }
    return respond(null, { code: "INVALID_ACTION", message: "Invalid request." }, 400);
  } catch (error) {
    // Never log codes, phone numbers, keys, links, or issued session tokens.
    console.error("[customer-phone-otp]", error instanceof Error ? error.message : "Request failed");
    return respond(null, { code: "OTP_UNAVAILABLE", message: "We couldn't complete sign-in. Please try again or use email or Google." }, 503);
  }
});
