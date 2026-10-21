import { sendTextBeeSms } from "../_shared/textbee.ts";
import { timingSafeEqual } from "../_shared/paymentProvider.ts";

const serve = Deno.serve;

serve(async (req) => {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
  const authorized = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("OPERATIONS_WORKER_TOKEN")]
    .some(secret => Boolean(secret && token && timingSafeEqual(secret, token)));
  if (!authorized) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { user, sms } = payload as {
    user?: { phone?: unknown };
    sms?: { otp?: unknown };
  };
  const phone = typeof user?.phone === "string" ? user.phone : "";
  const otpCode = typeof sms?.otp === "string" ? sms.otp : "";
  if (!phone.trim() || !otpCode.trim()) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await sendTextBeeSms(
    phone,
    `Your LS Customs verification code is: ${otpCode}`,
  );
  if (!result.success) {
    return new Response(JSON.stringify({ error: "Failed to send SMS" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
