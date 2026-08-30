/**
 * Edge Function: payment-webhook
 *
 * Receives asynchronous payment status updates from the configured provider
 * (Stripe or PayMongo). Verifies the provider's webhook signature BEFORE
 * touching the database. Updates payments.status and (for vehicle bookings)
 * the parent booking's status.
 *
 * Provider selection is via the `PAYMENT_PROVIDER` env var:
 * - "paymongo" → PayMongo signature format (`Paymongo-Signature` header)
 * - "stripe"   → Stripe signature format (`stripe-signature` header)
 *
 * Auth: None (public endpoint) — authentication is via webhook signature.
 * Any request that fails signature verification is rejected before any
 * database action is taken.
 *
 * API contract: API.md §2.3
 */

import { createServiceClient } from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";
import {
  getProvider,
  normalizeWebhookEvent,
  verifyWebhookSignature,
} from "../_shared/paymentProvider.ts";

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
    // 1. Read raw body BEFORE parsing — signature is computed on raw bytes
    // ------------------------------------------------------------------
    const rawBodyBuffer = await req.arrayBuffer();
    const rawBody = new TextDecoder().decode(rawBodyBuffer);

    // ------------------------------------------------------------------
    // 2. Determine provider and verify signature
    // ------------------------------------------------------------------
    const provider = getProvider();

    const verification = await verifyWebhookSignature(req, rawBody, provider);

    if (!verification.verified) {
      console.error(
        `Webhook signature verification failed — provider=${provider}, reason=${verification.reason ?? "unknown"}`,
      );
      return new Response(
        JSON.stringify({ received: false }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ------------------------------------------------------------------
    // 3. Parse payload and normalize provider-specific event structure
    // ------------------------------------------------------------------
    const payload = JSON.parse(rawBody);
    const event = normalizeWebhookEvent(provider, payload);

    if (!event) {
      const err: EdgeFunctionError = {
        code: "VALIDATION_ERROR",
        message: "Invalid webhook payload: missing type or provider reference",
      };
      return jsonResponse(null, err, 400);
    }

    // Determine new payment status based on event type
    let newPaymentStatus: string | null = null;

    switch (event.type) {
      case "payment_intent.succeeded":
        newPaymentStatus = "succeeded";
        break;
      case "payment_intent.payment_failed":
      case "charge.failed":
        newPaymentStatus = "failed";
        break;
      default:
        // Unhandled event type — ack but don't process
        console.log(`Ignoring unhandled webhook event type: ${event.type} (provider=${event.provider})`);
        return new Response(
          JSON.stringify({ received: true }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
    }

    const supabase = createServiceClient();
    const providerReference = event.providerReference;

    // ------------------------------------------------------------------
    // 4. Look up and update the payment record
    // ------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, booking_type, booking_id, status")
      .eq("provider_reference", providerReference)
      .single();

    if (paymentError || !payment) {
      console.error(
        `No payment record found for provider_reference: ${providerReference}`,
      );
      // Ack the webhook even if we don't have a matching payment,
      // to avoid infinite retries from the provider.
      return new Response(
        JSON.stringify({ received: true }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Idempotency: skip if already in this state
    if (payment.status === newPaymentStatus) {
      return new Response(
        JSON.stringify({ received: true }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Update payment status
    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({ status: newPaymentStatus })
      .eq("id", payment.id);

    if (updatePaymentError) {
      console.error("Failed to update payment status:", updatePaymentError.message);
      return new Response(
        JSON.stringify({ received: false }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ------------------------------------------------------------------
    // 5. On success, update the parent booking's status
    // ------------------------------------------------------------------
    // Per API.md §2.3:
    //   rental → confirmed
    //   service → leave as-is (payment unlocks but doesn't change workflow status)
    if (newPaymentStatus === "succeeded") {
      if (payment.booking_type === "vehicle") {
        const { error: updateBookingError } = await supabase
          .from("vehicle_bookings")
          .update({ status: "confirmed" })
          .eq("id", payment.booking_id);

        if (updateBookingError) {
          console.error("Failed to update booking status:", updateBookingError.message);
          // Payment status was updated — note the booking update failure
          // but don't fail the webhook ack.
        }
      }
      // For service bookings: payment success doesn't change the booking's
      // workflow status. The service_bookings.status is controlled by
      // the mechanic's progress (assigned → en_route → in_progress → completed).
    }

    // ------------------------------------------------------------------
    // Return 200 OK — providers require a fast, simple ack
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("payment-webhook error:", message);
    // Even on error, return 200 to prevent provider retries
    // unless it's a signature failure (which we handle above).
    return new Response(
      JSON.stringify({ received: false }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
