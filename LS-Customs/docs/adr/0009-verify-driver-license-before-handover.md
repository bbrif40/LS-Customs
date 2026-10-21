# Verify the driver's license before rental handover

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. Customers may begin a rental request before driver verification, but an admin must verify the customer's driver's license before releasing the vehicle. Show this requirement before checkout. Payment confirmation alone does not authorize vehicle handover; license verification is also required.

An admin must approve the uploaded license before online payment is collected or a cash reservation is confirmed. Customers upload first, wait for review, then proceed to payment or cash confirmation. This supersedes the earlier allowance to confirm a booking before verification and avoids collecting payment from a customer who cannot qualify to collect the vehicle. Require the customer to upload a driver license in the rental payment section; other ID types are not accepted; this applies to the checkout flow including cash selection. Admin verification remains required before handover. Evidence retention and handling of failed verification remain unresolved.




Reserve the selected vehicle for the requested rental period while the uploaded license is under admin review; it must not remain available to competing bookings for those dates. This review hold is distinct from a confirmed rental reservation. The review hold expires after 1 hour if admin approval has not been recorded. Alert admins immediately when review is requested and show the customer the review deadline. On timeout, release the vehicle and let the customer retry, subject to availability. After license approval, email the customer that the ID has been approved and they may proceed to online payment as soon as possible, within 3 hours of approval. Use this 3-hour window rather than the previously proposed 30 minutes. Cash is collected on pickup day before handover. Once a cash rental is confirmed, customer cancellation is unavailable. Admin cancellation remains available, and the 3-hour pickup no-show expiry still applies. Disclose this restriction before cash confirmation. If an uploaded license is unreadable, show the admin review reason and allow a replacement upload within the original 1-hour review window. Re-upload does not restart or extend the hold timer. If the license is expired or does not match the customer, the admin rejects the request and immediately releases the vehicle reservation. Show a clear rejection reason and allow a new request with a valid, matching license, subject to availability.





For online-payment rentals, if payment has not succeeded within 3 hours of license approval, automatically expire the reservation, release the vehicle, and email the customer. A retry requires a fresh availability check. If payment is received after expiry, keep the reservation expired and refund 100% of that payment. Show Refund pending until refund confirmation and alert admins if the refund fails. Never reinstate the expired reservation automatically or displace another reservation.





License images are private and accessible only to the uploading customer and authorized admins. Do not include the images in public links or emails. Record admin verification actions in the audit log. Image retention remains unresolved.

Reuse an approved license for future rentals until it expires, avoiding repeated uploads. Require a new review if the license is replaced or the verified customer identity changes. A reusable approval satisfies the license prerequisite only; each booking still requires vehicle availability and its own applicable checkout steps.

The approved license must remain valid through the agreed rental return date. Check validity for the full requested rental period, and check it again before approving an extension; an extension must not outlast license validity.
