# Allow cash rental reservations with payment before handover

For approved customer cancellations of prepaid rentals before vehicle handover, refund 100% of rental payments and release the reservation. Customers cannot cancel a confirmed cash rental reservation; admins may still cancel it, and the agreed 3-hour pickup no-show expiry still applies. This replaces the earlier free customer cancellation rule for unpaid cash rental reservations. Keep cancellation approval and refund settlement visible as separate outcomes so a pending refund is not presented as already paid.

After handover, an early vehicle return does not automatically reduce the original agreed rental price or create a refund for unused time. Allow admin-reviewed exceptions and show the early-return rule before booking. This does not define other cancellation or service-failure scenarios after handover.

Rental extensions require an availability check for conflicting reservations, admin approval, and confirmed payment of the additional price before the current agreed return deadline. Show the additional price before acceptance. Change the return deadline only after approval and confirmed payment; while the request or payment is pending, the original deadline and late-return rules remain in effect. Charge extensions at the vehicle daily rate for each additional started 24-hour period; an approved 6-hour extension costs one additional rental day. The ₱250 hourly late-return charge applies to unapproved late returns, not time covered by an approved, paid extension.

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Customers may confirm vehicle rental reservations using cash payment, with payment outstanding until collection. An admin must record cash collection before vehicle handover and before the rental starts. This commits fleet availability to an unpaid reservation while keeping vehicle release conditional on payment; unlike mechanic services, rental cash is collected before delivery of the service.

An unpaid cash reservation expires 3 hours after its scheduled pickup time if the customer has not arrived: notify the customer and release the vehicle, unless an admin records an agreed extension before expiry. Customers must select a pickup time from available pickup hours when booking; show the exact pickup time and 3-hour expiry deadline to both customer and admin. The current rental booking flow captures pickup and return dates only, so this requires a change. Pickup hours, extension limits, and the handling of an arrived customer whose payment is still being processed remain unresolved.



Rental handovers and returns operate daily from 8 AM to 6 PM, Philippine time (Asia/Manila). Offer customer pickup and return times within those hours; outside-hours arrangements require admin approval.

The 3-hour cash pickup no-show grace period preserves the reservation but does not guarantee handover outside operating hours. For example, a 5 PM pickup retains its 8 PM no-show deadline, but collection after 6 PM requires an admin-approved arrangement. Without an agreed arrangement or recorded extension, the reservation expires at its stated deadline.
