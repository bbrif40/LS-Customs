# OpenStreetMap migration and rider tracking redesign

Implementation and activation status: see [live-tracking-setup.md](live-tracking-setup.md). The assessment below records the starting state and target design. Foreground GPS, the secure data flow, customer/admin UI and routing adapters are now implemented; production activation and background tracking remain outstanding.

## Scope and current implementation

Replace Leaflet with MapLibre GL JS displaying OpenStreetMap raster tiles. Preserve the shared MapView and LocationPicker interfaces, click selection, draggable destination, popups, bounds fitting and resize behavior. Remove lazyMap.tsx and Leaflet dependencies/styles. The booking map shows distinct destination and recorded mechanic markers; it does not represent a recorded coordinate as a fresh GPS fix.

The current customer GPS hook writes customer coordinates to service_bookings. It must never supply the rider marker. Mechanic coordinates currently come from mechanic_profiles, without a dedicated GPS timestamp in the customer query. Customer bookings currently load once or on manual refresh. The current tracker has no real route or ETA provider. These are prerequisites for live tracking, not features supplied by OSM.

## Customer experience

Use a map above a compact arrival card. Show a green mechanic marker, gold fixed service destination, road route, estimated arrival range, mechanic name, call action, last GPS update and recenter button. Preserve user panning; move the camera only when follow mode is enabled or recenter is pressed. Animate verified GPS updates between positions without inventing movement during outages.

States: awaiting assignment, assigned/waiting for GPS, on the way, location delayed, reconnecting, arrived/in progress and completed/cancelled. After 30 seconds without a fix label the position delayed; after 90 seconds suppress ETA and label it last known. Missing GPS must show the destination and an explicit waiting message. Stop sharing at terminal status. Arrival requires a mechanic status update; proximity alone must not complete a booking.

## Backend and telemetry

1. Add a booking-scoped current-location table: booking_id, mechanic_id, latitude, longitude, accuracy_m, heading_deg, speed_mps, recorded_at, received_at and monotonic sequence. Index booking_id. Retain only the latest location by default; define retention explicitly if a history table is needed.
2. Publish from the authenticated assigned mechanic device while assigned/en_route. Send approximately every 5 seconds when moving and 15 seconds when stationary, with one request in flight. Validate coordinate ranges, timestamps, accuracy and assignment on the server; reject older sequences and unrealistic jumps. Store received_at using server time. Bound offline queues and avoid replaying old fixes as current.
3. Use an authenticated RPC or Edge Function for writes. RLS allows the assigned mechanic to publish, the booking owner to read during the active booking, and authorized dispatch staff to read. Customers cannot write rider coordinates. Do not use global mechanic broadcasts or service-role keys in the client.
4. Enable Supabase Realtime for the location table. Subscribe by booking_id, fetch the initial snapshot, resync after reconnect, and clean up subscriptions when closed or signed out. Subscribe to booking status and assignment changes too. Update the open modal from current records rather than its captured booking snapshot. Poll the authorized booking location every 15 seconds only when Realtime is disconnected.
5. For Capacitor Android, explicitly implement native GPS/background permissions and an appropriate foreground location service if tracking must survive screen lock. Browser watchPosition alone cannot guarantee that behavior. Expose permission-denied and tracking-paused states to the mechanic.

## Routes and ETA

Use an OSM-backed routing provider through a server-side adapter (for example hosted OSRM, Valhalla or a contracted routing provider). Return GeoJSON geometry, road distance, duration and calculated_at. Keep provider secrets server-side; apply authentication, timeouts, caching and rate limits. Recalculate around every 20–30 seconds or after meaningful route deviation, rather than on every GPS fix. Cancel obsolete requests when a booking or destination changes.

Routing duration is an estimate. Display an arrival range and refresh time; do not describe it as traffic-aware unless the provider supplies traffic data. On routing failure keep the markers and show ETA unavailable. Never substitute straight-line distance divided by an invented speed or fixed values such as 12 minutes.

## Delivery order and acceptance

1. Renderer migration: verify all customer/admin maps, popup escaping, dragging, click selection, bounds, modal resizing, lazy loading and Android WebGL support. Configure VITE_OSM_TILE_URL when using a hosted tile service; provide provider-specific attribution alongside OSM attribution.
2. Secure telemetry: deploy migration and RPC, test customer/other-mechanic denial, terminal booking denial, invalid coordinates, late fixes and assignment changes; verify with two real devices.
3. Live UI: verify reconnect, stale expiry without incoming events, modal updates, reduced-motion behavior, follow/recenter, GPS denial and cleanup.
4. Routing and ETA: configure provider, verify road geometry, deviation recalculation, provider outages and stale ETA suppression.
5. Android release: validate foreground/background tracking, battery use and device sleep on physical devices, then regenerate Capacitor assets and APK. Existing dist/APK files are generated artifacts and are not rewritten by a source-only migration.

## References

- MapLibre raster tiles: https://maplibre.org/maplibre-gl-js/docs/examples/map-tiles/
- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/

OSM public tiles require visible attribution and compliant caching/request behavior; they provide no SLA. Select suitable hosted tiles for production scale and native-app policy compatibility. The existing Nominatim search also needs a separate production geocoding review; replacing the renderer does not change that service.
