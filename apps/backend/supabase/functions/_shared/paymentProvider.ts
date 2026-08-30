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
  clientSecret: string;      // Normalized API field — "client_secret" for Stripe, "client_key" for PayMongo
  amount: number;
  currency: string;
  provider: PaymentProvider;
}

export interface NormalizedWebhookEvent {
  type: string;              // e.g. "payment_intent.succeeded", "payment_intent.payment_failed"
  providerReference: string; // e.g. "pi_123..." or "pi_..." (PayMongo)
  provider: PaymentProvider;
}

export interface WebhookVerificationResult {
  verified: boolean;
  provider: PaymentProvider;
  reason?: string;
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
  idempotencyKey?: string,
): Promise<CreatePaymentIntentResult> {
  const config = getProviderConfig();
  const amountInCents = Math.round(amount * 100);

  if (config.provider === "paymongo") {
    return createPaymongoPaymentIntent(config, amountInCents, bookingType, bookingId, userId);
  }

  return createStripePaymentIntent(config, amountInCents, bookingType, bookingId, userId, idempotencyKey);
}

/**
 * Create a Payment Intent via the PayMongo API.
 *
 * PayMongo uses:
 * - Basic auth: `base64(secret_key:)` (secret key as username, empty password)
 * - JSON body with nested `data.attributes` structure
 * - Returns `client_key` (not `client_secret`) in `data.attributes`
 *
 * @see https://docs.paymongo.com/docs/api/api-reference/payment-intents/create-payment-intent
 */
async function createPaymongoPaymentIntent(
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
          payment_method_allowed: ["card", "gcash", "grabpay", "qrph"],
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
    amount: attributes.amount / 100, // Convert back for display
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

    // Event type can be at data.type or data.attributes.type (fallback)
    const eventType = (data.type as string | undefined)
      ?? (data.attributes as Record<string, unknown> | undefined)?.type as string | undefined;

    // Payment intent ID can be at:
    // - data.attributes.payment_intent_id (most common for webhook events)
    // - data.id (if data IS the payment intent, not an event wrapper)
    const attributes = data.attributes as Record<string, unknown> | undefined;
    const paymentIntentId = (attributes?.payment_intent_id as string | undefined)
      ?? (attributes?.id as string | undefined)
      ?? (data.id as string | undefined);

    if (!eventType || !paymentIntentId) {
      return null;
    }

    const normalizedType = mapPaymongoEventType(eventType);

    return {
      type: normalizedType,
      providerReference: paymentIntentId,
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
 *
 * PayMongo webhook event types:
 * - `payment_intent.succeeded` → normalized as `payment_intent.succeeded`
 * - `payment_intent.failed` → normalized as `payment_intent.payment_failed`
 * (Stripe uses `payment_intent.payment_failed`, so we normalize for consistency)
 */
function mapPaymongoEventType(eventType: string): string {
  const mapping: Record<string, string> = {
    "payment_intent.succeeded": "payment_intent.succeeded",
    "payment_intent.failed": "payment_intent.payment_failed",
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
