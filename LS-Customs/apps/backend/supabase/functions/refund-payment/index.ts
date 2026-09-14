/**
 * Edge Function: refund-payment
 *
 * Issues a refund for a previously succeeded payment via the configured
 * provider (Stripe or PayMongo). Admin-only.
 *
 * Flow:
 *   1. Authenticate caller, verify admin role
 *   2. Fetch the `payments` row by id; reject if status !== 'succeeded'
 *   3. Call the provider's refund API via createRefund()
 *   4. Update `payments.status` → 'refunded'
 *   5. The existing notify_on_payment_status_change trigger will fire a
 *      'payment_status_changed' notification to the customer
 *
 * Auth: Requires an authenticated admin JWT with role='admin'.
 *
 * API contract: API.md §2.x (admin actions)
 */

import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";
import {
  createRefund,
  getProviderConfig,
  type CreateRefundResult,
} from "../_shared/paymentProvider.ts";

interface RefundPaymentRequest {
  payment_id: string;
}

interface RefundPaymentResponse {
  refund_id: string;
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
    // 1. Authenticate caller and verify admin role
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
        message: "Invalid or expired JWT",
      }, 401);
    }
    const caller = await userRes.json();
    const callerId: string = caller.id;

    // Verify the caller is an admin by reading their profile role.
    const supabase = createServiceClient();
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();

    if (callerProfileError) {
      console.error("refund-payment: failed to read caller profile", callerProfileError.message);
      return jsonResponse(null, {
        code: "INTERNAL_ERROR",
        message: "Failed to verify caller",
      }, 500);
    }

    if (callerProfile?.role !== "admin") {
      return jsonResponse(null, {
        code: "FORBIDDEN",
        message: "Admin privileges required",
      }, 403);
    }

    // ------------------------------------------------------------------
    // 2. Parse and validate request body
    // ------------------------------------------------------------------
    const body: RefundPaymentRequest = await req.json().catch(() => null);
    if (!body || !body.payment_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required field: payment_id",
      }, 400);
    }

    if (!UUID_REGEX.test(body.payment_id)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "payment_id must be a valid UUID",
      }, 400);
    }

    // ------------------------------------------------------------------
    // 3. Fetch the payment row; verify it's in a refundable state
    // ------------------------------------------------------------------
    const { data: payment, error: paymentFetchError } = await supabase
      .from("payments")
      .select("id, status, provider_reference, amount, currency, provider, customer_id")
      .eq("id", body.payment_id)
      .single();

    if (paymentFetchError || !payment) {
      return jsonResponse(null, {
        code: "NOT_FOUND",
        message: `Payment ${body.payment_id} not found`,
      }, 404);
    }

    if (payment.status !== "succeeded") {
      return jsonResponse(null, {
        code: "INVALID_STATE",
        message: `Payment must be in 'succeeded' status to refund (current: ${payment.status})`,
      }, 409);
    }

    // ------------------------------------------------------------------
    // 4. Check provider configuration
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
    // 5. Call the provider's refund API
    // ------------------------------------------------------------------
    // The payment's amount is stored in display units (e.g. 7500.00 PHP),
    // and createRefund converts to cents internally. We pass the full
    // amount for a complete refund — partial refunds can be added later
    // by accepting an optional `amount` field in the request body.
    let refund: CreateRefundResult;
    try {
      refund = await createRefund(payment.provider_reference, Number(payment.amount));
    } catch (providerErr: unknown) {
      const msg = providerErr instanceof Error
        ? providerErr.message
        : String(providerErr);
      console.error(`${config.provider} refund API error:`, msg);
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: `Provider refund error: ${msg}`,
      }, 502);
    }

    // ------------------------------------------------------------------
    // 6. Update the payment record to 'refunded'
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", payment.id);

    if (updateError) {
      // The refund was issued but we couldn't record it.
      // Log loudly — in production we'd want to reconcile via the webhook.
      console.error("refund-payment: failed to update payment status:", updateError.message);
      return jsonResponse(null, {
        code: "INTERNAL_ERROR",
        message: "Refund was issued to the provider but could not be recorded. Please verify manually.",
      }, 500);
    }

    // The notify_on_payment_status_change trigger now also fires on
    // 'refunded' (see migration 20260920120000), so the customer
    // automatically receives a notification.

    // ------------------------------------------------------------------
    // 7. Return refund details
    // ------------------------------------------------------------------
    return jsonResponse({
      refund_id: refund.refundReference,
      amount: refund.amount,
      currency: refund.currency.toUpperCase(),
      provider: refund.provider,
    } as RefundPaymentResponse, null, 200);

  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "INTERNAL_ERROR",
        message: errObj.message,
      }, errObj.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("refund-payment error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
