# LS Customs

LS Customs provides vehicle rentals and mobile mechanic services.

## Language

**Confirmed mechanic appointment**:
A scheduled mechanic appointment with secured mechanic capacity and either successful online payment or an agreed cash payment due after service.
_Avoid_: Payment confirmed (when referring to the appointment), paid request

**Checkout hold**:
A temporary reservation of mechanic capacity for up to 10 minutes while a customer completes checkout. It expires if checkout is not completed.

**Cash due after service**:
The outstanding cash payment for a confirmed mechanic appointment, collected after service and recorded by the mechanic.
_Avoid_: Paid, payment succeeded (before collection)

**Completed mechanic service**:
A mechanic service whose work has finished, regardless of whether payment has been collected.
_Avoid_: Paid service (when referring only to completed work)

**Confirmed rental reservation**:
A reservation securing a vehicle for the agreed rental dates, with either successful online payment or an agreed cash payment due before handover.

**Vehicle handover**:
The transfer of a rental vehicle to the customer after payment has been collected.

**Rental day**:
A 24-hour period measured from the agreed pickup time.

**Late-return charge**:
An additional charge owed on the customer's account for retaining a rental vehicle past its agreed return time, at ₱250 for each completed hour late. Partial hours do not incur a charge.

**Unpaid-fee account flag**:
A reversible admin marker identifying a customer's unresolved late-return charges, while preserving account history and sign-in access for settlement.
_Avoid_: Ban, account deletion

**Daily unpaid-fee penalty**:
An additional ₱1,000 owed for each completed unpaid day beyond the initial 24-hour payment period for a posted late-return fee. The first penalty is added 48 hours after the original fee is posted.

## Booking recovery and service coverage (2026-10-21)
Customer routes survive reload. Per-user, per-tab booking drafts expire after 24 hours and are removed on sign-out; payment secrets and license uploads are never persisted. Existing checkout amounts and deadlines are reloaded from the server. Service coverage uses an admin-editable 100 km geodesic radius centered on Manila (14.5995, 120.9842), reaching Bulacan and Cavite. The server verifies pins without reverse geocoding; changing coverage expires outstanding pin checks. Published terms version 2026-10-21 records the new coverage policy while preserving accepted history.
