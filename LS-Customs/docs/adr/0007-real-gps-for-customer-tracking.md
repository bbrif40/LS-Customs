# Use actual mechanic GPS for customer tracking

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Customer tracking must use the mechanic's actual GPS location and show its last-update time. When location is unavailable, display “Location unavailable.” Keep simulated journeys for demos only; simulated movement must not stand in for actual mechanic movement in normal customer bookings.

The current booking-route function generates virtual journeys and the tracker labels them as simulation, while a separate mechanic GPS-sharing flow already exists. Actual tracking depends on mechanic location updates rather than a clock-driven animation, trading a continuously moving marker for an accurate account of available location data. Continue GPS sharing while the mechanic app is in the background during an active trip only, with explicit location permission and a visible tracking indicator. Stop sharing when the mechanic arrives or the booking is cancelled. If location permission is denied or GPS fails, the mechanic may still start the trip. Alert the admin, show “Live location unavailable” to the customer, and keep manual booking status updates available. Do not substitute simulated movement. Mark location stale after 60 seconds without an update. Label the last known position “Last seen” and show its age; hide the arrival estimate until fresh GPS updates resume.



