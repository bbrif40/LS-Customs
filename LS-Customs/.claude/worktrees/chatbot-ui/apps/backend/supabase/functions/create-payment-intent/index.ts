/**
 * Edge Function: create-payment-intent
 *
 * Given a booking_type ('vehicle' or 'service') and booking_id, creates a
 * payment intent with the configured provider (Stripe or PayMongo) and
 * records it in the `payments` table.
 *
 * The provider is selected via the `PAYMENT_PROVIDER` env var:
 * - "paymongo" → PayMongo (Philippines) payment intent API
 * - "stripe"   → Stripe payment intent API (default, backwards-compatible)
 *
 * Auth: Requires authenticated customer JWT; verifies the booking belongs
 * to the caller via an explicit ownership check on top of RLS.
 *
 * API contract: API.md §2.2
 */

import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";
import {
  createPaymentIntent,
  getProviderConfig,
  type CreatePaymentIntentResult,
} from "../_shared/paymentProvider.ts";

interface CreatePaymentIntentRequest {
  booking_type: "vehicle" | "service";
  booking_id: string;
}

interface CreatePaymentIntentResponse {
  payment_id: string;
  client_secret: string;
  amount: number;
  currency: string;
  provider: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Parse and validate request body
    // ------------------------------------------------------------------
    const body: CreatePaymentIntentRequest = await req.json().catch(() => null);
    if (!body || !body.booking_type || !body.booking_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required fields: booking_type and booking_id",
      }, 400);
    }

    if (body.booking_type !== "vehicle" && body.booking_type !== "service") {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "booking_type must be 'vehicle' or 'service'",
      }, 400);
    }

    if (!UUID_REGEX.test(body.booking_id)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "booking_id must be a valid UUID",
      }, 400);
    }

    // ------------------------------------------------------------------
    // Authenticate caller — verify JWT via GoTrue directly
    // ------------------------------------------------------------------
    const jwt = extractJwt(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${jwt}`,
      },
    });
    if (!userRes.ok) {
      return jsonResponse(null, {
        code: "UNAUTHENTICATED",
        message: "Missing or invalid JWT",
      }, 401);
    }
    const user = await userRes.json();

    const supabase = createServiceClient();

    // ------------------------------------------------------------------
    // 1. Fetch the booking; verify ownership and get total_price
    // ------------------------------------------------------------------
    let booking: { total_price: number; customer_id: string } | null = null;

    if (body.booking_type === "vehicle") {
      const { data, error } = await supabase
        .from("vehicle_bookings")
        .select("total_price, customer_id")
        .eq("id", body.booking_id)
        .single();

      if (error || !data) {
        return jsonResponse(null, {
          code: "NOT_FOUND",
          message: `Vehicle booking ${body.booking_id} not found`,
        }, 404);
      }
      booking = data;
    } else {
      const { data, error } = await supabase
        .from("service_bookings")
        .select("total_price, customer_id")
        .eq("id", body.booking_id)
        .single();

      if (error || !data) {
        return jsonResponse(null, {
          code: "NOT_FOUND",
          message: `Service booking ${body.booking_id} not found`,
        }, 404);
      }
      booking = data;
    }

    // Verify ownership — per RULES.md §4, RLS is the source of truth,
    // but we add an explicit ownership check in the Edge Function too.
    if (booking.customer_id !== user.id) {
      const err: EdgeFunctionError = {
        code: "FORBIDDEN",
        message: "You do not own this booking",
      };
      return jsonResponse(null, err, 403);
    }

    // ------------------------------------------------------------------
    // 2. Check provider configuration
    // ------------------------------------------------------------------
    const config = getProviderConfig();
    if (!config.secretKey) {
      console.error(
        `PAYMENT_PROVIDER=${config.provider} — secret key is not set`,
      );
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: "Payment provider is not configured",
      }, 502);
    }

    // ------------------------------------------------------------------
    // 3. Call the payment provider to create a payment intent
    // ------------------------------------------------------------------
    const amountNumeric = Number(booking.total_price);

    // Idempotency support: forward from client header if present
    const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;

    let intent: CreatePaymentIntentResult;
    try {
      intent = await createPaymentIntent(
        body.booking_type,
        body.booking_id,
        user.id,
        amountNumeric,
        idempotencyKey,
      );
    } catch (providerErr: unknown) {
      const msg = providerErr instanceof Error
        ? providerErr.message
        : String(providerErr);
      console.error(`${config.provider} API error:`, msg);
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: `Payment provider error: ${msg}`,
      }, 502);
    }

    // ------------------------------------------------------------------
    // 4. Insert a payments row: status='pending', provider_reference=intent id
    // ------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        booking_type: body.booking_type,
        booking_id: body.booking_id,
        customer_id: user.id,
        amount: booking.total_price,
        currency: "PHP",
        provider: intent.provider,
        provider_reference: intent.providerReference,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      console.error("Failed to create payment record:", paymentError.message);
      // The payment intent was created in the provider but we couldn't record it.
      // In production, we'd want to reverse the intent here.
      return jsonResponse(null, {
        code: "INTERNAL_ERROR",
        message: "Payment intent created but failed to record payment",
      }, 500);
    }

    // ------------------------------------------------------------------
    // 5. Return client secret for the frontend SDK to complete payment
    // ------------------------------------------------------------------
    return jsonResponse({
      payment_id: payment.id,
      client_secret: intent.clientSecret,
      amount: amountNumeric,
      currency: intent.currency.toUpperCase(),
      provider: intent.provider,
    } as CreatePaymentIntentResponse, null, 200);

  } catch (err: unknown) {
    // Handle non-Error throws — e.g., extractJwt throws a plain object with
    // { code, message, status } rather than an Error instance.
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "INTERNAL_ERROR",
        message: errObj.message,
      }, errObj.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-payment-intent error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
