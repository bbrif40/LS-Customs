# Customer → rental + mechanic → receipts → admin simulation

Date: 2026-10-08, Asia/Taipei. Website: https://ls-customs-web.vercel.app/

## Execution status

**Live customer-to-admin simulation executed.** After the user signed in, the customer created both reservations and the admin approved the rental and assigned the mechanical service. Per the user's instructions, PayMongo was not used and no payment was made. The user explicitly confirmed **SMS and email received**. Recipient delivery is user-confirmed; inbox contents and the phone were not directly inspected by the agent.

| Booking | Schedule | Amount | Final database state |
|---|---|---:|---|
| Toyota Wigo, `4cc42133-98dc-460f-b6b3-3a73ee664044` | December 10–12, 2026 | ₱2,800 | confirmed |
| Full Synthetic Oil Change, `3f3e41f6-0a69-4c4b-9187-a22c7d30aa94` | October 9, 2026, 10 AM | ₱174.99 | assigned |

Andre Villanueva was selected for the service. Read-only backend evidence is saved in `artifacts/apk-test/live-customer-admin-evidence.json`. Neither booking has a payment row. The test bookings remain in the production database; they were not completed, charged, deleted or cancelled.

## Errors and holes observed during the live run

1. **Critical: repository-seeded admin password still authenticates in production.** The configured seeded account successfully opened the live admin portal. A password shipped in repository SQL therefore still grants administrative access. Credentials are deliberately omitted from this report. The missing hardening migration previously flagged by the regression test now has a confirmed live consequence.
2. **High: fabricated payment amounts.** Service details displayed **Amount Paid ₱180 / Change ₱5.01** despite no payment being made and no payment record existing. `renderBookingDetailsModal` calculates these values from booking ID character codes and total price, instead of payments. Rental booking time is also calculated from the current clock rather than the stored creation timestamp.
3. **High: saved address can acquire a false map pin.** The selected address was in Quezon City; the admin map showed central Manila. `StepLocation.pickDefault()` substitutes `14.5995, 120.9842` when saved coordinates are missing, then the booking treats that invented pin as a real location. This can misdirect dispatch and travel pricing.
4. **Mechanic display breaks after successful assignment.** The status became Assigned, but the table continued to say Unassigned. Browser warnings report a failed mechanics query. `useAdminData.ts` requests fields including `specialties` and `user_id`; the failed lookup prevents resolving the assigned mechanic's name. Exact database error was not expanded by the browser log.
5. **Confirmation hides the assignment action.** Assign Mechanic is rendered only for pending service bookings. After confirming, it disappeared; the test had to return this service to pending, select Andre, and then verify Assigned. A normal approve-then-assign flow is obstructed.
6. **Edit action does nothing.** Clicking the service row's Edit button produced no form. Its handler only calls `stopPropagation()`.
7. **Distance display is inconsistent.** Review showed 3.5 km, while the created booking's payment summary showed 0.0 km with the same ₱85 fee. `StepReview` uses literal 3.5 as a fallback when distance is zero, so the review can invent an estimate.
8. **Admin realtime callback error.** The exposed browser log recorded `cannot add postgres_changes callbacks for realtime:overview-payments-changes after subscribe()` and an AdminLayout pane error. `useAdminOverviewStats` uses a fixed topic name. This is the same class of shared-channel reuse failure as the previous customer settings issue; booking actions themselves still completed.
9. **Unpaid booking/receipt workflow mismatch.** Both bookings successfully progress through manual admin approval without payment records, but `send-receipt` requires a succeeded payment. A received email cannot be assumed to be a paid receipt. The user confirmed email arrival, but its subject/content was not inspected.
10. **Missing vehicle photographs.** Catalog and rental details use Photo Coming Soon placeholders.

## Successful live functions

- Existing customer session loads the workspace and profile identity.
- Rental catalog, vehicle search and vehicle details work.
- Rental dates and server booking creation work; two days total ₱2,800.
- Rental payment screen shows a booking reference and unpaid hold warning without requiring a charge to reach Bookings.
- Mechanical category/service selection, date and time selection, saved-address selection, quote review and reservation creation work.
- Customer Bookings updates to two pending reservations with the correct names, references, schedules and totals.
- Customer sign-out and configured admin sign-in work.
- Admin overview and booking lists show both customer reservations.
- Admin rental confirmation persists in the database.
- Admin service confirmation and subsequent manual assignment persist; Andre was selected.
- Customer SMS and email delivery were confirmed by the user.
- Read-only verification confirms final states and that no payment records were created.
- A full admin reload shows Andre as On Job and both reservations in Recent Bookings.
- Audit Logs records rental confirmation, service confirmation, return to pending, assignment and the assigned status transition under the test admin.

## Actual observations

- Guest workspace renders without the previous error-boundary page.
- Rentals navigation loads the live catalog: 28 vehicles, search, categories, pickup/return dates and pagination.
- Ten visible vehicles use “PHOTO COMING SOON”; product photographs are missing on that page.
- Later in this run, customer booking and admin approval were exercised as described above. SMS/email arrival was user-confirmed; a paid-receipt inbox check remains unverified.

## Confirmed regression test results

These use real local PostgreSQL/Edge Function code with fixture identities/providers. They are separate from live delivery.

- Edge Function suite: 24 passed, zero failed. Includes ownership rejection for another customer's checkout/receipt/assignment, unsigned notification rejection, missing-payment receipt rejection, cancelled/expired checkout rejection, HTML escaping, payment signature checks and OTP identity preservation.
- Booking PostgreSQL suite: 17 passed, one failed. Passed checks include server-calculated price, rental request idempotency, rental overlap rejection, mechanic booking atomicity/capacity, cancellation controls, payment replay reconciliation, privacy isolation, admin access and receipt throttling.
- Failed check: test for disabling a published seeded-admin password cannot run because migration `20261006120100_disable_seeded_admin_passwords.sql` is absent. This is a confirmed repository/test gap; it does not establish that a live admin account currently accepts that password. No such sign-in was attempted.

## Source findings requiring simulation validation

1. **Receipt failures can be hidden from admins.** `useAdminPayments.ts` awaits `functions.invoke('send-receipt')` but never checks its returned `error` or response envelope. `AdminBookings.tsx` similarly uses `.catch()` on the rental confirmation invocation. Supabase function errors can be returned rather than thrown, so booking/payment success can be shown without receipt delivery success.
2. **Approval does not guarantee a receipt.** Rental confirmation invokes `send-receipt`, but the endpoint requires a `succeeded` payment and otherwise returns 404. Mechanical booking status changes do not invoke that receipt endpoint in `handleStatusChange`; other payment paths must send it. Waiting before payment/approval may therefore produce no receipt. This is an ordering issue to check, not evidence of a live delivery failure.
3. **SMS simulation can be reported as dispatch success.** `dispatch-notification` falls back to `simulated_sms` when configured gateways fail, sets `dispatched` based on nonempty channels, and returns HTTP 200 with `simulated: true`. This is not proof a phone received an SMS. Both flags must be inspected.
4. **Client SMS helper can return true after failure.** `useSmsNotification.ts` warns on notification insertion or function invocation errors but still returns true. It also does not interpret the dispatch envelope's `dispatched`, `simulated`, or provider errors.
5. **Some status events intentionally skip SMS.** Dispatch gates delivery on assigned events or explicit `dispatch_sms` metadata. Creating or confirming a booking alone is not sufficient evidence that an SMS should arrive.
6. **Provider acceptance is not recipient delivery.** The receipt transport returns a mail message ID after Gmail SMTP accepts it; this does not prove inbox arrival. SMS provider acceptance likewise needs device/provider delivery evidence.
7. **Log privacy gap.** Notification dispatch logs contain recipient phone/email and message content. This increases exposure of contact information and booking details in backend logs.

## Remaining verification limits

The customer was signed out to exercise the configured admin credentials in the same browser profile. Final customer-panel rendering after approval was not tested under a freshly restored customer session. Final approval states were checked directly through the authorized admin API and audit logs instead. No concurrent double-booking stress test was run against production; those protections passed the isolated PostgreSQL suite.

The received email's exact subject and receipt contents were not inspected. The test did not pay or fabricate a payment record. Notification metadata could not be read under the admin's customer-scoped notification RLS, so real versus simulated provider outcome was established only by the user's report of arrival, not by database delivery metadata.

No source fixes, commits or deployment were made during this testing request. This report records findings, not remediation.

Automatic approval review rejected an additional direct receipt-endpoint diagnostic for unpaid bookings because it could send external email or create incorrect delivery records. That call was not executed or retried; receipt eligibility was inspected in source instead. Notification rows returned no visible results under the admin session's customer-scoped notification RLS, so this is not evidence that no notifications exist.
