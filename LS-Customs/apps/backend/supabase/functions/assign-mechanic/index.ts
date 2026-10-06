/**
 * Edge Function: assign-mechanic
 *
 * Given a pending service_bookings.id, finds the nearest available mechanic
 * using stored current_lat/current_lng on mechanic_profiles, assigns them,
 * and updates the booking status to 'assigned'.
 *
 * Notifications are created by the notify_on_status_change trigger
 * (DATABASE.md §5.4), not here — this function only updates the booking.
 *
 * Auth: Accepts either an authenticated customer JWT (verifies ownership)
 * or a service-role call from a DB webhook (no JWT required).
 *
 * API contract: API.md §2.1
 */

import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { getCorsHeaders, jsonResponse as baseJsonResponse } from "../_shared/cors.ts";

interface AssignMechanicRequest {
  service_booking_id: string;
}

// UUID regex for input validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Parse and validate request body
    // ------------------------------------------------------------------
    const body: AssignMechanicRequest = await req.json().catch(() => null);
    if (!body || !body.service_booking_id) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required field: service_booking_id",
      }, 400);
    }

    const bookingId = body.service_booking_id;
    if (typeof bookingId !== 'string' || !UUID_REGEX.test(bookingId)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "service_booking_id must be a valid UUID",
      }, 400);
    }

    // ------------------------------------------------------------------
    // Determine caller identity (if authenticated)
    // ------------------------------------------------------------------
    // Per API.md §2.1: accepts either a customer/admin JWT or a service-role
    // call from a DB webhook. Service-role key must be explicitly verified.
    const supabase = createServiceClient();
    let callerId: string | null = null;
    let isServiceRole = false;

    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Check if this is a service-role invocation (DB webhook)
    if (bearerToken && bearerToken === serviceRoleKey) {
      isServiceRole = true;
    } else {
      // Try to authenticate as a regular user
      try {
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
        const user = await userRes.json();
        callerId = user.id;
      } catch {
        // No valid JWT and not service-role — reject
        return jsonResponse(null, {
          code: "UNAUTHENTICATED",
          message: "Authentication required: provide a valid JWT or service-role key",
        }, 401);
      }
    }

    // ------------------------------------------------------------------
    // Authorization remains scoped to the caller before the trusted transaction.
    const { data: booking, error: bookingError } = await supabase.from('service_bookings')
      .select('customer_id').eq('id', bookingId).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return jsonResponse(null, { code: 'NOT_FOUND', message: 'Booking not found' }, 404);
    if (!isServiceRole && booking.customer_id !== callerId) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', callerId).maybeSingle();
      if (profile?.role !== 'admin') return jsonResponse(null, { code: 'FORBIDDEN', message: 'Booking access denied' }, 403);
    }
    const { data, error } = await supabase.rpc('assign_booking_mechanic', { p_booking_id: bookingId });
    if (error) {
      console.error('Assignment rejected:', error.message);
      const noCapacity = error.message.includes('No mechanic');
      return jsonResponse(null, { code: noCapacity ? 'NO_MECHANIC_AVAILABLE' : 'INVALID_STATE',
        message: noCapacity ? 'No mechanic is available for this appointment. Your request is saved; contact support or choose another time.'
          : 'Dispatch could not proceed. Confirm payment and check that the booking is active.' }, 409);
    }
    return jsonResponse(data, null, 200);
  } catch (err: unknown) {
    console.error('assign-mechanic error:', err instanceof Error ? err.message : String(err));
    return jsonResponse(null, { code: 'INTERNAL_ERROR', message: 'Dispatch is temporarily unavailable' }, 500);
  }
});
