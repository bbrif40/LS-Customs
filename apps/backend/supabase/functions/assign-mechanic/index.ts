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
import { corsHeaders, jsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";

interface AssignMechanicRequest {
  service_booking_id: string;
}

interface AssignMechanicResponse {
  service_booking_id: string;
  mechanic_id: string;
  mechanic_name: string | null;
  status: string;
}

// UUID v4 regex for input validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Haversine distance between two points in kilometers.
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
    if (!UUID_REGEX.test(bookingId)) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "service_booking_id must be a valid UUID",
      }, 400);
    }

    // ------------------------------------------------------------------
    // Determine caller identity (if authenticated)
    // ------------------------------------------------------------------
    // Per API.md §2.1: accepts either a customer JWT or a service-role
    // call from a DB webhook. No JWT → trusted webhook invocation.
    const supabase = createServiceClient();
    let callerId: string | null = null;

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
      // No JWT provided — assume service-role/webhook invocation.
      // The caller is trusted (DB webhook), so we proceed without
      // an ownership check.
    }

    // ------------------------------------------------------------------
    // 1. Fetch the booking; confirm status = 'pending'
    // ------------------------------------------------------------------
    const { data: booking, error: bookingError } = await supabase
      .from("service_bookings")
      .select("id, customer_id, status, pin_lat, pin_lng, address_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse(null, {
        code: "NOT_FOUND",
        message: `Service booking ${bookingId} not found`,
      }, 404);
    }

    // If caller is authenticated, verify ownership
    if (callerId && booking.customer_id !== callerId) {
      return jsonResponse(null, {
        code: "FORBIDDEN",
        message: "You do not own this booking",
      }, 403);
    }

    // Idempotency: if already past 'pending', return current state
    if (booking.status !== "pending") {
      const { data: current } = await supabase
        .from("service_bookings")
        .select("mechanic_id, status")
        .eq("id", bookingId)
        .single();

      if (current?.mechanic_id) {
        const { data: mech } = await supabase
          .from("mechanic_profiles")
          .select("id, profiles!inner(full_name)")
          .eq("id", current.mechanic_id)
          .single();

        return jsonResponse({
          service_booking_id: bookingId,
          mechanic_id: current.mechanic_id,
          mechanic_name: (mech?.profiles as { full_name: string } | null | undefined)?.full_name ?? null,
          status: current.status,
        } as AssignMechanicResponse, null, 200);
      }

      const error: EdgeFunctionError = {
        code: "INVALID_STATE",
        message: `Booking is in status '${booking.status}', expected 'pending'`,
      };
      return jsonResponse(null, error, 409);
    }

    // ------------------------------------------------------------------
    // 2. Fetch pin location (address_id → lat/lng, or direct pin_lat/pin_lng)
    // ------------------------------------------------------------------
    let pinLat: number | null = booking.pin_lat;
    let pinLng: number | null = booking.pin_lng;

    if (booking.address_id && !pinLat && !pinLng) {
      const { data: addr, error: addrError } = await supabase
        .from("addresses")
        .select("lat, lng")
        .eq("id", booking.address_id)
        .single();

      if (addrError || !addr) {
        return jsonResponse(null, {
          code: "INVALID_STATE",
          message: "Booking references an invalid address_id",
        }, 409);
      }

      pinLat = addr.lat;
      pinLng = addr.lng;
    }

    if (!pinLat || !pinLng) {
      return jsonResponse(null, {
        code: "INVALID_STATE",
        message: "Booking has no usable location (pin_lat/pin_lng or address_id required)",
      }, 409);
    }

    // ------------------------------------------------------------------
    // 3. Query available mechanics, ordered by distance (Haversine)
    // ------------------------------------------------------------------
    // Per RULES.md §2: no raw string interpolation of user input.
    // We use the Supabase client's query builder with parameterized values.
    // distance is computed via the haversine formula in a select raw block.
    const { data: mechanics, error: mechError } = await supabase
      .from("mechanic_profiles")
      .select(`
        id,
        is_available,
        current_lat,
        current_lng,
        years_experience,
        rating_avg,
        profiles!inner(id, full_name)
      `)
      .eq("is_available", true)
      .not("current_lat", "is", null)
      .not("current_lng", "is", null)
      .order("rating_avg", { ascending: false });

    if (mechError) {
      console.error("Error fetching mechanics:", mechError.message);
      return jsonResponse(null, {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch available mechanics",
      }, 500);
    }

    if (!mechanics || mechanics.length === 0) {
      return jsonResponse(null, {
        code: "NO_MECHANIC_AVAILABLE",
        message: "No available mechanic found near this location.",
      }, 409);
    }

    // Find nearest using Haversine distance
    const nearest = mechanics.reduce((best: typeof mechanics[0] | null, current) => {
      if (!current.current_lat || !current.current_lng) return best;
      const dist = haversineDistance(
        pinLat!, pinLng!,
        current.current_lat, current.current_lng
      );
      if (best === null) {
        return { ...current, _distance: dist };
      }
      const bestDist = (best as Record<string, unknown>)._distance as number;
      return dist < bestDist ? { ...current, _distance: dist } : best;
    }, null as (typeof mechanics[0] & { _distance?: number }) | null);

    if (!nearest) {
      return jsonResponse(null, {
        code: "NO_MECHANIC_AVAILABLE",
        message: "No available mechanic found near this location.",
      }, 409);
    }

    // ------------------------------------------------------------------
    // 4. Assign the nearest mechanic: set mechanic_id, status = 'assigned'
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from("service_bookings")
      .update({
        mechanic_id: nearest.id,
        status: "assigned",
      })
      .eq("id", bookingId);

    if (updateError) {
      console.error("Failed to assign mechanic:", updateError.message);
      return jsonResponse(null, {
        code: "INTERNAL_ERROR",
        message: "Failed to assign mechanic to booking",
      }, 500);
    }

    // The notify_on_status_change trigger (DATABASE.md §5.4) will create
    // notification rows for the customer and the newly-assigned mechanic
    // automatically as part of the same transaction.

    return jsonResponse({
      service_booking_id: bookingId,
      mechanic_id: nearest.id,
      mechanic_name: (nearest.profiles as { full_name: string } | null | undefined)?.full_name ?? null,
      status: "assigned",
    } as AssignMechanicResponse, null, 200);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("assign-mechanic error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
