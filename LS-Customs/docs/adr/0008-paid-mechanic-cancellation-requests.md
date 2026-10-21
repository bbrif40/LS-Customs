# Mechanic cancellation requests and refunds

Accepted and refined during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Customers may request cancellation directly from a paid mechanic booking instead of contacting support separately. Show “Cancellation requested” while an admin reviews cancellation and any refund. Keep the appointment active, including its capacity reservation, until cancellation is approved; a request alone does not cancel the booking or promise a refund.

For an approved customer cancellation before the mechanic starts travelling, refund 100% of the amount paid. This replaces the earlier 45% decision for that scenario. After travel starts but before service begins, refund 45% and retain 55%. Show the exact proposed refund before the customer submits the request, subject to admin approval. If LS Customs cancels because no mechanic can attend, refund 100% of the amount paid.

Cash mechanic bookings can be cancelled free of charge before service begins because no upfront payment has been collected. Three customer-initiated cash mechanic booking cancellations within a rolling 30-day period trigger admin review. Exclude provider-initiated cancellations. Keep this review separate from unpaid-fee account flags; the threshold itself does not authorize an automatic ban or booking restriction. The paid-booking 55% retention is not an amount owed on an unpaid cash booking.

Once work begins, cancellation requires support review rather than a standard percentage refund. Let the customer report the issue from the booking; an admin assesses completed work and any refund.

