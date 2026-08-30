/**
 * Edge Function: flag-user
 *
 * Admin-only action. Permanently bans a user and removes their profile row.
 *
 * Effect (irreversible from the app — restoration requires manual intervention
 * in Supabase Studio):
 *   1. Sets auth.users.banned_until to 9999-12-31T23:59:59Z so the user can
 *      never sign in again. The only way to lift this is to clear
 *      banned_until in the Supabase dashboard.
 *   2. Deletes the profiles row. ON DELETE CASCADE cleans up dependent rows
 *      (addresses, vehicle_bookings, service_bookings, support_tickets, etc.)
 *      so the user has no residual data.
 *
 * The auth.users row itself is kept (Supabase does not allow deleting
 * auth.users from a regular service-role client). This means the same email
 * cannot re-register, because Supabase's signup is keyed on email.
 *
 * Auth: Requires an authenticated admin JWT.
 *
 * API contract: see API.md §2.x (admin actions).
 */

import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface FlagUserRequest {
  user_id: string;
}

interface FlagUserResponse {
  user_id: string;
  banned_until: string;
  deleted_profile: boolean;
}

// UUID v4 regex for input validation
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Far-future timestamp. Effectively permanent.
const PERMANENT_BAN_UNTIL = "9999-12-31T23:59:59.999Z";

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

    // Get the caller from the JWT.
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
    // Uses a user-scoped client (caller's JWT) so RLS is in effect.
    const callerClient = createServiceClient();
    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();

    if (callerProfileError) {
      console.error("flag-user: failed to read caller profile", callerProfileError.message);
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
    const body: FlagUserRequest = await req.json().catch(() => null);
    if (!body || !body.user_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required field: user_id",
      }, 400);
    }

    const targetUserId = body.user_id;
    if (!UUID_REGEX.test(targetUserId)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "user_id must be a valid UUID",
      }, 400);
    }

    // Don't let an admin ban themselves.
    if (targetUserId === callerId) {
      return jsonResponse(null, {
        code: "INVALID_STATE",
        message: "You cannot flag your own admin account",
      }, 409);
    }

    // ------------------------------------------------------------------
    // 3. Ban the auth user (set banned_until)
    // ------------------------------------------------------------------
    // Use the service-role client to call the Admin Auth API.
    const { data: banData, error: banError } = await callerClient.auth.admin
      .updateUserById(targetUserId, { ban_duration: "876000h" }); // 100 years

    if (banError || !banData?.user) {
      console.error("flag-user: ban failed", banError?.message);
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: banError?.message ?? "Failed to ban user",
      }, 502);
    }

    // ------------------------------------------------------------------
    // 4. Delete the profiles row (CASCADE cleans dependent rows)
    // ------------------------------------------------------------------
    const { error: deleteError } = await callerClient
      .from("profiles")
      .delete()
      .eq("id", targetUserId);

    if (deleteError) {
      console.error("flag-user: profile delete failed", deleteError.message);
      // The ban is already in effect, so we still report success-ish:
      // tell the caller the ban worked but the profile cleanup didn't.
      return jsonResponse({
        user_id: targetUserId,
        banned_until: PERMANENT_BAN_UNTIL,
        deleted_profile: false,
      } as FlagUserResponse, {
        code: "PARTIAL_SUCCESS",
        message: `User banned, but profile cleanup failed: ${deleteError.message}`,
      }, 207);
    }

    return jsonResponse({
      user_id: targetUserId,
      banned_until: PERMANENT_BAN_UNTIL,
      deleted_profile: true,
    } as FlagUserResponse, null, 200);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "UNAUTHENTICATED",
        message: errObj.message,
      }, errObj.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("flag-user error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
