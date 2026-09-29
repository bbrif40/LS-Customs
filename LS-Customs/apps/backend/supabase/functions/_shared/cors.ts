/**
 * CORS headers for Edge Functions.
 * Per API.md §2, all functions return JSON with a consistent envelope.
 * This helper provides the headers every function needs.
 *
 * SECURITY: Origin is validated against ALLOWED_ORIGINS env var (comma-separated).
 * Falls back to a permissive wildcard only during local development when no
 * ALLOWED_ORIGINS is configured.
 */

const ALLOWED_ORIGINS_RAW = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const ALLOWED_ORIGINS: string[] = ALLOWED_ORIGINS_RAW
  ? ALLOWED_ORIGINS_RAW.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

/**
 * Resolve the Access-Control-Allow-Origin value for a given request origin.
 * Returns the origin itself if it's in the allow-list (so credentials work),
 * or "*" only when no allow-list is configured (local dev).
 */
export function resolveOrigin(requestOrigin: string | null): string {
  if (ALLOWED_ORIGINS.length === 0) {
    // No allow-list configured — local development; allow all.
    return "*";
  }
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Unknown origin — return the first allowed origin (browser will block
  // the response because it doesn't match the request origin).
  return ALLOWED_ORIGINS[0];
}

/** Static CORS headers (origin is resolved per-request via getCorsHeaders). */
const staticCorsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, content-length, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

/**
 * Build CORS headers for a specific request.
 * Falls back to wildcard only when ALLOWED_ORIGINS is unset (local dev).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? null;
  return {
    ...staticCorsHeaders,
    "Access-Control-Allow-Origin": resolveOrigin(origin),
  };
}

/**
 * Backwards-compatible static export — uses wildcard when ALLOWED_ORIGINS is
 * unset. Callers that have access to the Request should prefer getCorsHeaders(req).
 */
export const corsHeaders: Record<string, string> = {
  ...staticCorsHeaders,
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : "*",
};

/**
 * Build a JSON response with CORS headers and a consistent envelope.
 */
export function jsonResponse<T>(
  data: T | null,
  error: EdgeFunctionError | null,
  status: number = 200,
  req?: Request,
): Response {
  return new Response(
    JSON.stringify({ data, error }),
    {
      status,
      headers: {
        ...(req ? getCorsHeaders(req) : corsHeaders),
        "Content-Type": "application/json",
      },
    },
  );
}

export interface EdgeFunctionError {
  code: string;
  message: string;
}
