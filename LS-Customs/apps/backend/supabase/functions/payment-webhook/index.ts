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
import { getCorsHeaders, jsonResponse as baseJsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";
import {
  getProvider,
  normalizeWebhookEvent,
  verifyWebhookSignature,
} from "../_shared/paymentProvider.ts";

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
      case "charge.refunded":
      case "payment_intent.refunded":
        newPaymentStatus = "refunded";
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
    let { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, booking_type, booking_id, status")
      .eq("provider_reference", providerReference)
      .maybeSingle();

    // If not found by primary ref and alternate references exist, try them
    if (!payment && event.alternateReferences?.length) {
      for (const altRef of event.alternateReferences) {
        const { data: altPayment } = await supabase
          .from("payments")
          .select("id, booking_type, booking_id, status")
          .eq("provider_reference", altRef)
          .maybeSingle();
        if (altPayment) {
          payment = altPayment;
          paymentError = null;
          break;
        }
      }
    }

    if (paymentError || !payment) {
      console.error(
        `No payment record found for provider_reference: ${providerReference}${event.alternateReferences ? ` (alternates: ${event.alternateReferences.join(", ")})` : ""}`,
      );
      // A provider event may beat our payment insert. Retry instead of losing it.
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

    // Reconcile both payment and booking in a transaction, including repeated
    // success events after a previous booking-confirmation failure.
    const { data: reconciliation, error: reconcileError } = await supabase.rpc('reconcile_payment', {
      p_payment_id: payment.id, p_status: newPaymentStatus,
    });
    if (reconcileError) {
      console.error('Payment reconciliation failed:', reconcileError.message);
      return jsonResponse(null, { code: 'INTERNAL_ERROR', message: 'Reconciliation will be retried' }, 500);
    }
    if (reconciliation?.requires_refund) {
      console.error('Payment succeeded after booking cancellation; refund review required', payment.id);
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    console.error('payment-webhook error:', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: false }), { status: 500, headers: corsHeaders });
  }
});
