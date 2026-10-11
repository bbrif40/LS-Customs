# Activate mechanic tracking

## Implemented

- Booking-specific GPS table, authenticated mechanic publishing RPC, server timestamps, stale/order/rate/jump checks, active-booking read permissions, cleanup at reassignment or terminal status, and Realtime publication.
- Mechanic dispatch panel for signed-in mechanic accounts, manual GPS sharing toggle, native Capacitor foreground location permissions, travel/arrival/completion actions, and visible GPS errors.
- Customer and admin arrival tracker with animated location, destination, road route, arrival range, last-update age, delayed/offline states, follow toggle and recenter. No simulated coordinates or fixed ETA.
- Geoapify motorcycle routing adapter and optional HTTPS OSRM adapter behind an authenticated Edge Function. Server cache limits provider requests to one per booking per 20 seconds. Routes are requested every 25 seconds, and hidden after 30 seconds without a fresh GPS fix or 60 seconds without a successful route update.

## Backend activation

From `apps/backend`, apply the new `20261011120000_booking_tracking.sql` migration to the intended Supabase environment using its normal migration workflow. Deploy the `booking-route` Edge Function with `supabase functions deploy booking-route`. Its handler verifies the caller with Supabase Auth and reads booking/location rows through the caller's RLS permissions; gateway JWT verification is disabled intentionally, matching other authenticated endpoints here.

Recommended provider: [Geoapify Routing API](https://apidocs.geoapify.com/docs/routing/). Create an API key in your own [Geoapify account](https://myprojects.geoapify.com/), then set `GEOAPIFY_API_KEY` as a Supabase Edge Function secret. Keep it out of frontend VITE variables and Git. Set `ROUTING_MODE=motorcycle` for riders or `drive` for cars. Use local `apps/backend/supabase/.env` for local testing. `.env.example` lists the settings without credentials.

Geoapify supports motorcycle profiles and OSM-based road routes. The documented free allowance is 3,000 credits/day; a basic short two-waypoint route starts at one credit. At a 25-second refresh interval a 20-minute trip needs roughly 48 requests (before retrying, extra viewers and surcharges), so monitor usage and choose a paid plan when volume requires it. Actual road access and ETA quality in Philippine service areas still need device/route validation. This integration requests free-flow travel times, not live traffic; the UI says traffic is not included.

For an existing OSRM deployment instead, leave Geoapify unset and configure `OSRM_BASE_URL` with an HTTPS server exposing `/route/v1/driving`. An optional `OSRM_API_KEY` is sent as a bearer token. Public OSRM demo endpoints are not selected automatically for production.

## Android packaging

Build the web app and run `npx cap sync android` from `apps/web` to copy the bundle and register `@capacitor/geolocation`. The Android manifest includes fine/coarse location permissions. Rebuild the APK using the existing Android build process. Foreground sharing pauses when the app is hidden. Continuous screen-lock/background tracking is **not implemented**: it requires a native location foreground service, notification/permission UX and physical-device testing.

The web bundle and plugin have been synced in this workspace. Android debug compilation was attempted but stopped because the geolocation plugin requires a Java 21 toolchain; this machine exposes Java 17 and 25, and Gradle could not locate Java 21. Install/configure JDK 21 before rebuilding. The existing APK is an older build and does not contain these changes.

## Validation before release

Use a real customer and assigned mechanic account on separate devices. Select the mechanic's assignment, allow location, enable sharing and start travelling. Confirm that the customer sees only that booking's mechanic, a destination and a route. Test GPS denial, inaccurate fixes, app hiding/resume, network loss/reconnect, manual panning with follow disabled, arrival, cancellation and reassignment. Confirm that no GPS remains accessible after terminal status. Validate several Metro Manila routes, road restrictions and observed arrival times before treating the estimate as operationally reliable.

Source verification includes TypeScript, Deno handler checks, PostgreSQL access tests and mocked routing normalization/auth tests. These do not replace physical-device GPS or live provider testing. Migration, provider credentials, hosted function deployment and device verification must be completed before a production rollout.

References: [Geoapify pricing](https://www.geoapify.com/pricing/), [traffic model documentation](https://apidocs.geoapify.com/how-to/routing/traffic-route-times), [OSRM API](https://project-osrm.org/docs/v5.24.0/api/), [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).
