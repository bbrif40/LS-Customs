/**
 * Shared payment provider abstraction for Edge Functions.
 *
 * Supports Stripe (default) and PayMongo (Philippines) via a single
 * `PAYMENT_PROVIDER` env-var switch. Each provider has its own auth
 * scheme, request/response shape, and webhook signature format.
 *
 * Per RULES.md §3, provider secret keys and webhook secrets are read from
 * the function environment (never committed). Test overrides (base URL)
 * are also supported for local development with mock servers.
 *
 * Usage:
 *   const result = await createPaymentIntent(bookingType, bookingId, userId, amount);
 *   const verified = await verifyWebhookSignature(req, rawBody, provider);
 *   const event  = normalizeWebhookEvent(provider, payload);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentProvider = "stripe" | "paymongo";

export interface CreatePaymentIntentResult {
  providerReference: string;
  clientSecret: string;      // Normalized API field — "client_secret" for Stripe, "checkout_url" / "client_key" for PayMongo
  checkoutUrl?: string;      // Hosted checkout URL (PayMongo Checkout Session)
  amount: number;
  currency: string;
  provider: PaymentProvider;
}

export interface CreatePaymentIntentOptions {
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}

export interface NormalizedWebhookEvent {
  type: string;              // e.g. "payment_intent.succeeded", "payment_intent.payment_failed"
  providerReference: string; // e.g. "pi_123...", "cs_...", or "pay_..."
  alternateReferences?: string[]; // related identifiers to match database records
  finalPaymentId?: string;   // specific charge payment id ("pay_...") if present
  provider: PaymentProvider;
}

export interface WebhookVerificationResult {
  verified: boolean;
  provider: PaymentProvider;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Refund support
// ---------------------------------------------------------------------------

export interface CreateRefundResult {
  refundReference: string;  // e.g. "re_123..." (Stripe) or "re_..." (PayMongo)
  amount: number;           // in display units (e.g. 7500.00 PHP), same as CreatePaymentIntentResult
  currency: string;
  provider: PaymentProvider;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export function getProvider(): PaymentProvider {
  const provider = (Deno.env.get("PAYMENT_PROVIDER") ?? "stripe").toLowerCase();
  if (provider === "paymongo") return "paymongo";
  return "stripe"; // default
}

/**
 * Resolve the provider-specific settings from environment variables.
 */
export interface ProviderConfig {
  provider: PaymentProvider;
  secretKey: string;
  webhookSecret: string;
  baseUrl: string;
}

export function getProviderConfig(): ProviderConfig {
  const provider = getProvider();

  if (provider === "paymongo") {
    return {
      provider: "paymongo",
      secretKey: Deno.env.get("PAYMONGO_SECRET_KEY") ?? Deno.env.get("PAYMENT_PROVIDER_SECRET_KEY") ?? "",
      webhookSecret: Deno.env.get("PAYMONGO_WEBHOOK_SECRET") ?? Deno.env.get("PAYMENT_PROVIDER_WEBHOOK_SECRET") ?? "",
      baseUrl: Deno.env.get("PAYMONGO_BASE_URL") ?? "https://api.paymongo.com",
    };
  }

  // Default: Stripe
  return {
    provider: "stripe",
    secretKey: Deno.env.get("PAYMENT_PROVIDER_SECRET_KEY") ?? "",
    webhookSecret: Deno.env.get("PAYMENT_PROVIDER_WEBHOOK_SECRET") ?? "",
    baseUrl: Deno.env.get("STRIPE_BASE_URL") ?? "https://api.stripe.com/v1",
  };
}

// ---------------------------------------------------------------------------
// Payment Intent Creation
// ---------------------------------------------------------------------------

/**
 * Create a payment intent with the configured provider.
 *
 * The amount is expected in the numeric price (e.g., 7500.00 PHP).
 * It is converted to the smallest currency unit (cents) before being
 * sent to the provider.
 *
 * @param bookingType  "vehicle" or "service"
 * @param bookingId    UUID of the booking
 * @param userId       UUID of the customer
 * @param amount       Total price as a number (e.g. 7500.00)
 * @returns            Provider-agnostic result with a normalized client_secret
 */
export async function createPaymentIntent(
  bookingType: string,
  bookingId: string,
  userId: string,
  amount: number,
  optionsOrIdempotencyKey?: CreatePaymentIntentOptions | string,
): Promise<CreatePaymentIntentResult> {
  const config = getProviderConfig();
  const amountInCents = Math.round(amount * 100);

  const options: CreatePaymentIntentOptions = typeof optionsOrIdempotencyKey === "string"
    ? { idempotencyKey: optionsOrIdempotencyKey }
    : optionsOrIdempotencyKey ?? {};

  if (config.provider === "paymongo") {
    return createPaymongoCheckoutSession(config, amountInCents, bookingType, bookingId, userId, options);
  }

  return createStripePaymentIntent(config, amountInCents, bookingType, bookingId, userId, options.idempotencyKey);
}

/**
 * Create a Checkout Session via the PayMongo API (preferred for hosted checkout with GCash, Maya, Cards, QR Ph).
 * Falls back to raw Payment Intent if the endpoint is not supported by the environment/mock server.
 */
async function createPaymongoCheckoutSession(
  config: ProviderConfig,
  amountInCents: number,
  bookingType: string,
  bookingId: string,
  userId: string,
  options?: CreatePaymentIntentOptions,
): Promise<CreatePaymentIntentResult> {
  const authHeader = "Basic " + btoa(`${config.secretKey}:`);

  const billing: Record<string, string> = {};
  if (options?.customerName) billing.name = options.customerName;
  if (options?.customerEmail) billing.email = options.customerEmail;
  if (options?.customerPhone) billing.phone = options.customerPhone;

  const itemName = options?.description ||
    (bookingType === "vehicle" ? "Vehicle Rental Reservation" : "Mobile Mechanic Service Booking");

  const checkoutPayload = {
    data: {
      attributes: {
        billing: Object.keys(billing).length > 0 ? billing : undefined,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: `LS Customs: ${itemName} (#${bookingId.slice(0, 8).toUpperCase()})`,
        line_items: [
          {
            name: itemName,
            amount: amountInCents,
            currency: "PHP",
            quantity: 1,
          },
        ],
        payment_method_types: [
          "card",
          "gcash",
          "paymaya",
          "qrph",
          "billease",
          "dob",
        ],
        reference_number: bookingId,
        success_url: options?.successUrl,
        cancel_url: options?.cancelUrl,
        metadata: {
          booking_type: bookingType,
          booking_id: bookingId,
          customer_id: userId,
        },
      },
    },
  };

  try {
    const response = await fetch(`${config.baseUrl}/v1/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(checkoutPayload),
    });

    // If 404 (e.g. against a mock server only handling /v1/payment_intents), fall back to raw payment intent
    if (response.status === 404) {
      return createPaymongoRawPaymentIntent(config, amountInCents, bookingType, bookingId, userId);
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody?.errors?.[0]?.detail
        ?? errBody?.errors?.[0]?.code
        ?? response.statusText;
      throw new Error(`PayMongo API error: ${errMsg}`);
    }

    const data = await response.json();
    const attributes = data?.data?.attributes;

    if (!attributes) {
      throw new Error("PayMongo checkout session response missing attributes");
    }

    const checkoutUrl = attributes.checkout_url;
    const clientKey = attributes.client_key ?? checkoutUrl;

    return {
      providerReference: data.data.id,
      clientSecret: checkoutUrl || clientKey,
      checkoutUrl: checkoutUrl,
      amount: (attributes.line_items?.[0]?.amount ?? amountInCents) / 100,
      currency: "PHP",
      provider: "paymongo",
    };
  } catch (err: unknown) {
    // If the call failed because checkout_sessions wasn't reached, try raw payment intent as fallback
    if (err instanceof Error && err.message.includes("404")) {
      return createPaymongoRawPaymentIntent(config, amountInCents, bookingType, bookingId, userId);
    }
    throw err;
  }
}

/**
 * Fallback / direct Payment Intent creation via PayMongo API.
 */
async function createPaymongoRawPaymentIntent(
  config: ProviderConfig,
  amountInCents: number,
  bookingType: string,
  bookingId: string,
  userId: string,
): Promise<CreatePaymentIntentResult> {
  const authHeader = "Basic " + btoa(`${config.secretKey}:`);

  const response = await fetch(`${config.baseUrl}/v1/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amountInCents,
          currency: "PHP",
          payment_method_allowed: ["card", "gcash", "paymaya", "qrph"],
          metadata: {
            booking_type: bookingType,
            booking_id: bookingId,
            customer_id: userId,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody?.errors?.[0]?.detail
      ?? errBody?.errors?.[0]?.code
      ?? response.statusText;
    throw new Error(`PayMongo API error: ${errMsg}`);
  }

  const data = await response.json();
  const attributes = data?.data?.attributes;

  if (!attributes || !attributes.client_key) {
    throw new Error("PayMongo payment intent response missing client_key");
  }

  return {
    providerReference: data.data.id,
    clientSecret: attributes.client_key,
    checkoutUrl: `https://checkout.paymongo.com/${data.data.id}`,
    amount: attributes.amount / 100,
    currency: attributes.currency ?? "PHP",
    provider: "paymongo",
  };
}

/**
 * Create a Payment Intent via the Stripe API (original implementation).
 *
 * Stripe uses:
 * - Bearer token auth
 * - URL-encoded body params
 * - Returns `client_secret` directly
 */
async function createStripePaymentIntent(
  config: ProviderConfig,
  amountInCents: number,
  bookingType: string,
  bookingId: string,
  userId: string,
  idempotencyKey?: string,
): Promise<CreatePaymentIntentResult> {
  const params = new URLSearchParams({
    amount: amountInCents.toString(),
    currency: "php",
    metadata: JSON.stringify({
      booking_type: bookingType,
      booking_id: bookingId,
      customer_id: userId,
    }),
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(`${config.baseUrl}/payment_intents`, {
    method: "POST",
    headers,
    body: params,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody?.error?.message ?? response.statusText;
    throw new Error(`Stripe API error: ${errMsg}`);
  }

  const intent = await response.json();

  return {
    providerReference: intent.id,
    clientSecret: intent.client_secret,
    amount: intent.amount / 100,
    currency: intent.currency ?? "php",
    provider: "stripe",
  };
}

// ---------------------------------------------------------------------------
// Refund Creation
// ---------------------------------------------------------------------------

/**
 * Issue a refund for a previously created payment intent.
 *
 * The `providerReference` is the provider's payment intent id stored on
 * the `payments.provider_reference` column. The `amount` (if provided)
 * is in the same currency unit as the original charge (e.g. PHP); it is
 * converted to cents before sending to the provider. When omitted, the
 * full amount is refunded.
 *
 * @param providerReference  The provider's payment intent id (from payments.provider_reference)
 * @param amount             Optional partial refund amount in display units (e.g. 7500.00)
 * @returns                  Refund details with the provider's refund id
 */
export async function createRefund(
  providerReference: string,
  amount?: number,
): Promise<CreateRefundResult> {
  const config = getProviderConfig();

  if (config.provider === "paymongo") {
    return createPaymongoRefund(config, providerReference, amount);
  }

  return createStripeRefund(config, providerReference, amount);
}

/**
 * Create a refund via the PayMongo API.
 *
 * PayMongo refund endpoint:
 *   POST /v1/refunds
 *   Basic auth: base64(secret_key:)
 *   Body: { data: { attributes: { payment_intent_id, amount (in cents) } } }
 *
 * @see https://docs.paymongo.com/docs/api/api-reference/refunds/create-refund
 */
async function createPaymongoRefund(
  config: ProviderConfig,
  providerReference: string,
  amount?: number,
): Promise<CreateRefundResult> {
  const authHeader = "Basic " + btoa(`${config.secretKey}:`);
  let paymentId = providerReference;

  // If providerReference is a checkout session (cs_...) or payment intent (pi_...),
  // query PayMongo to resolve the underlying payment id (pay_...)
  if (providerReference.startsWith("cs_")) {
    try {
      const sessionRes = await fetch(`${config.baseUrl}/v1/checkout_sessions/${providerReference}`, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        const payments = sessionData?.data?.attributes?.payments;
        if (payments && payments.length > 0 && payments[0].id) {
          paymentId = payments[0].id;
        }
      }
    } catch (e) {
      console.warn("Could not resolve payment_id from checkout session:", e);
    }
  } else if (providerReference.startsWith("pi_")) {
    try {
      const intentRes = await fetch(`${config.baseUrl}/v1/payment_intents/${providerReference}`, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });
      if (intentRes.ok) {
        const intentData = await intentRes.json();
        const payments = intentData?.data?.attributes?.payments;
        if (payments && payments.length > 0 && payments[0].id) {
          paymentId = payments[0].id;
        }
      }
    } catch (e) {
      console.warn("Could not resolve payment_id from payment intent:", e);
    }
  }

  const attributes: Record<string, unknown> = {
    payment_id: paymentId,
    reason: "others",
  };

  if (amount != null) {
    attributes.amount = Math.round(amount * 100); // to cents
  }

  const response = await fetch(`${config.baseUrl}/v1/refunds`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ data: { attributes } }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody?.errors?.[0]?.detail
      ?? errBody?.errors?.[0]?.code
      ?? response.statusText;
    throw new Error(`PayMongo refund API error: ${errMsg}`);
  }

  const data = await response.json();
  const refundId = data?.data?.id;
  const attributes_ = data?.data?.attributes;

  if (!refundId) {
    throw new Error("PayMongo refund response missing id");
  }

  const refundAmount = attributes_?.amount ? attributes_.amount / 100 : (amount ?? 0);
  const refundCurrency = attributes_?.currency ?? "PHP";

  return {
    refundReference: refundId,
    amount: refundAmount,
    currency: refundCurrency,
    provider: "paymongo",
  };
}

/**
 * Create a refund via the Stripe API.
 *
 * Stripe refund endpoint:
 *   POST https://api.stripe.com/v1/refunds
 *   Bearer auth
 *   Body: URL-encoded payment_intent=<id> [& amount=<cents>]
 */
async function createStripeRefund(
  config: ProviderConfig,
  providerReference: string,
  amount?: number,
): Promise<CreateRefundResult> {
  const params: Record<string, string> = {
    payment_intent: providerReference,
  };

  if (amount != null) {
    params.amount = Math.round(amount * 100).toString(); // to cents
  }

  const response = await fetch(`${config.baseUrl}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody?.error?.message ?? response.statusText;
    throw new Error(`Stripe refund API error: ${errMsg}`);
  }

  const refund = await response.json();

  return {
    refundReference: refund.id,
    amount: (refund.amount ?? 0) / 100, // convert back to display units
    currency: refund.currency ?? "php",
    provider: "stripe",
  };
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify a webhook signature for the configured provider.
 *
 * Delegates to provider-specific verification:
 * - PayMongo: `Paymongo-Signature` header with `t=...,te=...,li=...` format
 * - Stripe: `stripe-signature` header with `t=...,v1=...` format
 *
 * @param req       The incoming Request object (for header access)
 * @param rawBody   The raw, unmodified request body as a string
 * @param provider  Which provider to verify against
 * @returns         Verification result
 */
export async function verifyWebhookSignature(
  req: Request,
  rawBody: string,
  provider: PaymentProvider,
): Promise<WebhookVerificationResult> {
  const config = getProviderConfig();

  if (!config.webhookSecret) {
    return {
      verified: false,
      provider,
      reason: "WEBHOOK_SECRET_NOT_SET",
    };
  }

  if (provider === "paymongo") {
    return verifyPaymongoSignature(req, rawBody, config.webhookSecret);
  }

  return verifyStripeSignature(req, rawBody, config.webhookSecret);
}

/**
 * Verify a PayMongo webhook signature.
 *
 * PayMongo sends the signature in the `Paymongo-Signature` header
 * with format: `t=<timestamp>,te=<test_signature>,li=<live_signature>`
 *
 * The expected signature is: HMAC-SHA256(webhook_secret, `${timestamp}.${raw_body}`)
 *
 * For test mode events, compare against `te`.
 * For live mode events, compare against `li`.
 *
 * @see https://docs.paymongo.com/docs/developer-tools-webhook-setup-management
 */
async function verifyPaymongoSignature(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<WebhookVerificationResult> {
  const sigHeader = req.headers.get("paymongo-signature");
  if (!sigHeader) {
    // Also accept the lowercase variant
    const altHeader = req.headers.get("x-paymongo-signature");
    if (!altHeader) {
      return { verified: false, provider: "paymongo", reason: "MISSING_SIGNATURE_HEADER" };
    }
    return verifyPaymongoSignatureParts(altHeader, rawBody, secret);
  }

  return verifyPaymongoSignatureParts(sigHeader, rawBody, secret);
}

/**
 * Core PayMongo signature verification logic.
 */
async function verifyPaymongoSignatureParts(
  sigHeader: string,
  rawBody: string,
  secret: string,
): Promise<WebhookVerificationResult> {
  const parts = sigHeader.split(",");
  let timestamp = "";
  let testSig: string | null = null;
  let liveSig: string | null = null;

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (!value) continue;
    if (key === "t") {
      timestamp = value;
    } else if (key === "te") {
      testSig = value;
    } else if (key === "li") {
      liveSig = value;
    }
  }

  if (!timestamp) {
    return { verified: false, provider: "paymongo", reason: "MISSING_TIMESTAMP" };
  }

  // Check timestamp freshness (replay attack prevention, 5 min tolerance)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) {
    return { verified: false, provider: "paymongo", reason: "TIMESTAMP_TOO_OLD" };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = await computeHmacSha256(secret, signedPayload);

  // For local/dev (test mode), check `te`.
  // For production (live mode), check `li`.
  // Accept either — this makes the function work in both environments.
  const candidateSigs = [testSig, liveSig].filter((s): s is string => s !== null);

  for (const sig of candidateSigs) {
    if (timingSafeEqual(expectedSig, sig)) {
      return { verified: true, provider: "paymongo" };
    }
  }

  return { verified: false, provider: "paymongo", reason: "SIGNATURE_MISMATCH" };
}

/**
 * Verify a Stripe webhook signature (original implementation).
 *
 * Stripe sends the signature in the `stripe-signature` header
 * with format: `t=<timestamp>,v1=<signature>`
 *
 * The expected signature is: HMAC-SHA256(webhook_secret, `${timestamp}.${raw_body}`)
 */
async function verifyStripeSignature(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<WebhookVerificationResult> {
  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    const genericSig = req.headers.get("x-signature");
    if (!genericSig) {
      return { verified: false, provider: "stripe", reason: "MISSING_SIGNATURE_HEADER" };
    }
    return verifyStripeSignatureParts(genericSig, rawBody, secret);
  }

  return verifyStripeSignatureParts(sigHeader, rawBody, secret);
}

/**
 * Core Stripe signature verification logic.
 */
async function verifyStripeSignatureParts(
  sigHeader: string,
  rawBody: string,
  secret: string,
): Promise<WebhookVerificationResult> {
  const sigParts = sigHeader.split(",");
  let timestamp = "";
  let signatures: string[] = [];

  for (const part of sigParts) {
    const [key, value] = part.trim().split("=");
    if (!value) continue;
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return { verified: false, provider: "stripe", reason: "MALFORMED_SIGNATURE" };
  }

  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) {
    return { verified: false, provider: "stripe", reason: "TIMESTAMP_TOO_OLD" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = await computeHmacSha256(secret, signedPayload);

  for (const sig of signatures) {
    if (timingSafeEqual(expectedSignature, sig)) {
      return { verified: true, provider: "stripe" };
    }
  }

  return { verified: false, provider: "stripe", reason: "SIGNATURE_MISMATCH" };
}

// ---------------------------------------------------------------------------
// Webhook Event Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a provider-specific webhook payload into a common format.
 *
 * PayMongo event:
 *   { data: { id: "evt_...", type: "payment_intent.succeeded",
 *             attributes: { payment_intent_id: "pi_...", ... } } }
 * Stripe event:
 *   { type: "payment_intent.succeeded", data: { object: { id: "pi_...", ... } } }
 *
 * The normalized result includes:
 * - type: the event type string (e.g. "payment_intent.succeeded")
 * - providerReference: the provider's payment intent ID
 * - provider: which provider sent the event
 */
export function normalizeWebhookEvent(
  provider: PaymentProvider,
  payload: unknown,
): NormalizedWebhookEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const payloadObj = payload as Record<string, unknown>;

  if (provider === "paymongo") {
    // PayMongo wraps everything in data: { id: "evt_...", type: "...", attributes: { ... } }
    const data = payloadObj.data as Record<string, unknown> | undefined;
    if (!data) {
      return null;
    }

    const eventType = (data.attributes as Record<string, unknown> | undefined)?.type as string | undefined
      ?? (data.type as string | undefined);

    const attributes = data.attributes as Record<string, unknown> | undefined;
    const innerData = attributes?.data as Record<string, unknown> | undefined;
    const innerAttributes = innerData?.attributes as Record<string, unknown> | undefined;

    // Resolve possible IDs from PayMongo structure
    // 1. Checkout session ID (e.g. cs_...)
    const checkoutSessionId = (innerData?.type === "checkout_session" ? innerData.id as string : undefined)
      ?? (innerAttributes?.checkout_session as Record<string, unknown> | undefined)?.id as string | undefined;

    // 2. Payment intent ID (e.g. pi_...)
    const paymentIntentId = (attributes?.payment_intent_id as string | undefined)
      ?? (innerAttributes?.payment_intent as Record<string, unknown> | undefined)?.id as string | undefined
      ?? (innerData?.type === "payment_intent" ? innerData.id as string : undefined);

    // 3. Payment ID (e.g. pay_...)
    const paymentsArr = innerAttributes?.payments as Array<Record<string, unknown>> | undefined;
    const paymentId = (innerData?.type === "payment" ? innerData.id as string : undefined)
      ?? (paymentsArr && paymentsArr.length > 0 ? (paymentsArr[0]?.id as string | undefined) : undefined);

    const primaryRef = checkoutSessionId
      ?? paymentIntentId
      ?? paymentId
      ?? (attributes?.id as string | undefined)
      ?? (data.id as string | undefined);

    if (!eventType || !primaryRef) {
      return null;
    }

    const alternateReferences = [checkoutSessionId, paymentIntentId, paymentId, attributes?.id as string | undefined]
      .filter((ref): ref is string => Boolean(ref) && ref !== primaryRef);

    const normalizedType = mapPaymongoEventType(eventType);

    return {
      type: normalizedType,
      providerReference: primaryRef,
      alternateReferences: alternateReferences.length > 0 ? alternateReferences : undefined,
      finalPaymentId: paymentId,
      provider: "paymongo",
    };
  }

  // Stripe: { type: "...", data: { object: { id: "...", ... } } }
  const eventType = payloadObj.type as string | undefined;
  const data = payloadObj.data as Record<string, unknown> | undefined;
  const object = data?.object as Record<string, unknown> | undefined;
  const paymentIntentId = object?.id as string | undefined;

  if (!eventType || !paymentIntentId) {
    return null;
  }

  return {
    type: eventType,
    providerReference: paymentIntentId,
    provider: "stripe",
  };
}

/**
 * Map PayMongo event types to the normalized type names used internally.
 */
function mapPaymongoEventType(eventType: string): string {
  const mapping: Record<string, string> = {
    "checkout_session.payment.paid": "payment_intent.succeeded",
    "payment.paid": "payment_intent.succeeded",
    "payment_intent.succeeded": "payment_intent.succeeded",
    "payment.failed": "payment_intent.payment_failed",
    "payment_intent.failed": "payment_intent.payment_failed",
    "payment_intent.payment_failed": "payment_intent.payment_failed",
    "payment.refunded": "payment_intent.refunded",
    "refund.created": "payment_intent.refunded",
    "payment_intent.refunded": "payment_intent.refunded",
    "payment_intent.awaiting_payment_method": "payment_intent.awaiting_payment_method",
    "payment_intent.chargeable": "payment_intent.chargeable",
  };
  return mapping[eventType] ?? eventType;
}

// ---------------------------------------------------------------------------
// Crypto utilities
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 and return as hex string.
 */
export async function computeHmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(key);
  const msgData = enc.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
