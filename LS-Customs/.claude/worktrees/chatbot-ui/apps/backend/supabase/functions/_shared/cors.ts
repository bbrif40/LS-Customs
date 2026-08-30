/**
 * CORS headers for Edge Functions.
 * Per API.md §2, all functions return JSON with a consistent envelope.
 * This helper provides the headers every function needs.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // TODO: restrict to known frontend origins in production
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, content-length, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

/**
 * Build a JSON response with CORS headers and a consistent envelope.
 */
export function jsonResponse<T>(
  data: T | null,
  error: EdgeFunctionError | null,
  status: number = 200,
): Response {
  return new Response(
    JSON.stringify({ data, error }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

export interface EdgeFunctionError {
  code: string;
  message: string;
}
