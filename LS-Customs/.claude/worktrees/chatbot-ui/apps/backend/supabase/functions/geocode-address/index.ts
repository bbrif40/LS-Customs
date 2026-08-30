/**
 * Edge Function: geocode-address
 *
 * Converts a human-readable address (line1, city) to geographic coordinates
 * (lat, lng) using the Google Maps Geocoding API.
 *
 * This is a server-side wrapper to avoid exposing the Google Maps API key
 * to the client bundle. The frontend sends the address text; this function
 * calls Google's Geocoding API and returns just the coordinates.
 *
 * Auth: Requires authenticated user JWT (addresses are user-scoped).
 *
 * API contract: API.md §2.5
 */

import {
  createServiceClient,
  extractJwt,
} from "../_shared/supabaseClient.ts";
import { corsHeaders, jsonResponse, type EdgeFunctionError } from "../_shared/cors.ts";

interface GeocodeRequest {
  address: string;
  city?: string;
}

interface GeocodeResponse {
  lat: number;
  lng: number;
  formatted_address: string;
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
    // Authenticate caller
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
        message: "Missing or invalid JWT",
      }, 401);
    }
    const user = await userRes.json();

    // ------------------------------------------------------------------
    // Parse and validate request body
    // ------------------------------------------------------------------
    const body: GeocodeRequest = await req.json().catch(() => null);
    if (!body || !body.address) {
      return jsonResponse(null, {
        code: "VALIDATION_ERROR",
        message: "Missing required field: address",
      }, 400);
    }

    // ------------------------------------------------------------------
    // Call Google Maps Geocoding API (server-side, API key hidden)
    // ------------------------------------------------------------------
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY is not set");
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: "Geocoding provider is not configured",
      }, 502);
    }

    const addressStr = body.city
      ? `${body.address}, ${body.city}`
      : body.address;

    const encodedAddress = encodeURIComponent(addressStr);
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const geocodeRes = await fetch(geocodeUrl);
    if (!geocodeRes.ok) {
      const geocodeErr = await geocodeRes.json().catch(() => ({}));
      console.error("Geocoding API error:", JSON.stringify(geocodeErr));
      return jsonResponse(null, {
        code: "PROVIDER_ERROR",
        message: `Geocoding provider error: ${geocodeRes.statusText}`,
      }, 502);
    }

    const geocodeData = await geocodeRes.json();
    if (geocodeData.status !== "OK" || !geocodeData.results || geocodeData.results.length === 0) {
      return jsonResponse(null, {
        code: "NOT_FOUND",
        message: `Could not geocode address: ${geocodeData.status}`,
      }, 404);
    }

    const result = geocodeData.results[0];
    const location = result.geometry.location;

    return jsonResponse({
      lat: location.lat,
      lng: location.lng,
      formatted_address: result.formatted_address,
    } as GeocodeResponse, null, 200);

  } catch (err: unknown) {
    // Handle non-Error throws (e.g., from extractJwt)
    if (err && typeof err === "object" && "status" in err) {
      const errObj = err as { code: string; message: string; status: number };
      return jsonResponse(null, {
        code: errObj.code ?? "UNAUTHENTICATED",
        message: errObj.message,
      }, errObj.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("geocode-address error:", message);
    return jsonResponse(null, {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }, 500);
  }
});
