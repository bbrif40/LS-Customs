/**
 * Shared Supabase client factory for Edge Functions.
 *
 * Per ARCHITECTURE.md §5 and RULES.md §3:
 * - The service_role key is NEVER exposed to the client bundle.
 * - Edge Functions read it from Deno.env.get('SUPABASE_SERVICE_ROLE_KEY').
 * - Client-facing operations (anon key) are used only when the function
 *   must act on behalf of the caller for read-only verification.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set in environment");
}
if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in environment");
}

/**
 * Create a service-role Supabase client.
 * Use this for privileged operations: inserts, updates, reads across tenants.
 * NEVER use this for operations the caller should be scoped to — RLS is the
 * backstop, but application logic should still verify ownership first.
 */
export function createServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a user-scoped Supabase client from a bearer JWT.
 * Use this when you need to read data as the caller (e.g., verify ownership).
 */
export function createUserClient(jwt: string) {
  return createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      jwtToken: jwt,
    },
  });
}

/**
 * Extract and verify the caller's JWT from the request.
 * Returns the JWT string for use with createUserClient.
 * Throws an error matching the API.md §4 error envelope if missing.
 */
export function extractJwt(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw {
      code: "UNAUTHENTICATED",
      message: "Missing or invalid Authorization header",
      status: 401,
    };
  }
  return authHeader.substring(7);
}
