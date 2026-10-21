# Require mechanic acceptance before appointment confirmation

Rescheduling a confirmed mechanic appointment requires fresh mechanic acceptance for the requested time. Preserve the existing appointment until the new time is secured and the customer accepts any price difference. If rescheduling fails, retain the original booking rather than releasing it prematurely. For prepaid bookings, collect any price increase before switching appointments and refund the difference if the new price is lower. For cash bookings, update the amount due after the customer accepts the new price. Keep refund settlement distinct from the appointment change so a refund still processing is not presented as already paid.

Accepted during the design interview on 2026-10-20; implemented locally; target deployment and device/provider checks remain in IMPLEMENTATION_PLAN.md. A mechanic must accept an offered assignment before the customer appointment is confirmed. Give the mechanic a short response window; offer the job to several eligible mechanics at once, with the first valid acceptance securing the assignment. Close the other offers immediately and prevent double assignment. An offer alone is not accepted capacity and must not be presented as a confirmed appointment.

This refines the capacity prerequisite for scheduled and roadside mechanic confirmation. Preserve the agreed payment rules: online scheduled checkout requires secured capacity before payment, while cash confirmation requires accepted mechanic capacity. Each offered mechanic has 5 minutes to accept. Show a countdown, expire unanswered offers, and prevent acceptance of an expired offer after reassignment. Use concurrent offers rather than sequential 5-minute waits. Each acceptance must still pass mechanic capacity and offer-expiry checks. If no mechanic accepts within the 5-minute offer window, keep the request unconfirmed, take no payment, release temporary capacity holds, and offer retry, another time, or support. Alert admins for failed roadside offer rounds.




The customer chooses online payment or cash before dispatch offers. After a mechanic accepts, online payment proceeds immediately and the appointment is confirmed as soon as payment succeeds; do not introduce an intentional wait before payment. This is a customer-authorized checkout, not an automatic debit without authorization. Cash appointments confirm immediately on mechanic acceptance, with cash due after service. The previously agreed 10-minute checkout hold remains the maximum time to complete an unfinished online checkout, not a required delay.

If online payment has failed, allow the customer to switch to cash within the remaining 10-minute checkout hold without losing the accepted mechanic. Cash selection confirms the appointment immediately, with payment due after service. Switching methods must not restart the hold timer. While an online payment is still processing, show Payment processing and prevent switching to cash until the payment outcome is known, avoiding collection through both methods. Offer admin/support help if the payment remains unresolved.


If online payment succeeds after the accepted mechanic capacity hold expires, refund 100% of that payment rather than automatically confirming the appointment. Keep the appointment unconfirmed and require a fresh availability check for retry, because the mechanic may have another assignment. Show the refund outcome separately from appointment status.

