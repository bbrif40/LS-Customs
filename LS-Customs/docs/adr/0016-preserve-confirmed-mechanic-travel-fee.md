# Preserve the confirmed travel fee when reassigning mechanics

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Reassigning a mechanic must not change the customer's confirmed travel fee. LS Customs absorbs travel-cost differences caused by reassignment. Any price increase requires a new quote and explicit customer approval before it becomes payable.

This makes the confirmed customer price stable despite operational changes. Reassignment must still respect the agreed appointment and mechanic capacity; this decision does not permit an unapproved change of service time.

If LS Customs needs to change the appointment time, offer the customer the choice to explicitly accept the new time or cancel for a 100% refund of the amount paid. Cash bookings can cancel without a fee in this situation. Do not silently reschedule; this provider-requested change is separate from the customer-initiated cancellation rules.
