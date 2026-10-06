# QA implementation — 6 October 2026

The remediation is implemented in this checkout. The booking security migration and all 11 Edge Functions were deployed to the linked Supabase project on 6 October 2026. The frontend remains a localhost preview; it has not been deployed to Vercel. The existing React, TypeScript, Deno, Node.js, and PostgreSQL stack is retained. The temporary Python editing script was removed. PGlite is a development-only PostgreSQL test engine; it adds no production service or browser storage requirement.

## Customer-facing changes

- Booking prices, discounts, and travel fees are computed from server records. Service bookings and their catalog items are saved in one transaction. Request IDs make retries reuse the same booking.
- Unpaid rentals have a 30-minute reservation expiry. The checkout and booking details display that deadline. Expired unpaid holds are reclaimed on the next reservation for the vehicle. Return dates consistently use half-open intervals, so another rental can start on the return date. Calendar arithmetic avoids UTC date shifts.
- Bookings offer Pay now, Resume payment, and Retry payment. Pending and failed provider checkouts are reused with real provider resume data. Payments remain processing until the backend records confirmation. Polling supplements Realtime after connection interruptions.
- Cancellation now uses an ownership-checked database transaction. Paid bookings require support and refund handling. Roadside cancellation changes the saved booking before clearing the customer display.
- Roadside requests require sign-in and an explicitly confirmed location. Failed GPS does not silently submit the default map center. The UI separates saved/pending, assigned, and en-route states; unavailable capacity produces a retryable saved request. Saved emergency requests are restored from the database.
- Fake mechanics, speed, routes, satellite status, and arrival estimates were removed. The tracker reports saved booking status and says when telemetry or ETA is unavailable.
- Receipt emails require an owned successful payment, use the account recipient and recorded amount, escape HTML, and have a durable one-minute request limit. Customers can request a receipt from booking details.
- Sign-in supports labelled fields, keyboard focus containment, Escape, focus restoration, OTP numeric entry/autofill, resend cooldown, Philippine phone normalization, and links to terms/privacy. Footer actions and vehicle-detail actions are keyboard-operable. Rental search has an accessible name.
- Guest mechanic listings use the restricted public RPC. Catalog failures have explicit error/retry controls.
- Several large screens load separately. The measured main JavaScript gzip size fell from 436.97 kB in the original QA build to approximately 356 kB. This is an improvement to the entry bundle, not a claim about total traffic or low-bandwidth performance; a large-chunk warning remains.

## Server protections

- Customers cannot promote their role or alter protected booking prices, ownership, assignments, service items, or lifecycle fields. Live location writes are limited to active owned bookings, with server timestamps.
- Public discovery returns travel distance and fee without exact named mechanic coordinates. Assigned customers can read mechanic location only while their booking is active.
- Notification payload shape no longer authenticates a request. Internal dispatch uses a private Vault/Edge Function token; verified admin requests remain supported. CORS responses use the actual request origin, including validation-error responses, and include `Vary: Origin`.
- Automatic and manual mechanic assignments both enforce appointment capacity and a travel buffer. An ongoing job continues to reserve capacity. Ordinary service dispatch requires successful payment; emergency requests are pay-on-arrival.
- Signed webhooks reconcile payment and rental state in a transaction. Repeated success can repair confirmation; stale failure cannot downgrade success; missing payment records return a retryable failure. A late payment keeps a cancelled booking cancelled and creates one admin notification for refund review.
- Checkout creation uses a durable five-minute lease to prevent simultaneous provider requests from multiple tabs. Provider errors retain the lease until expiry. Return URLs must use an approved HTTPS origin. Live PayMongo rejects test-mode signatures. Raw provider IDs are never turned into invented hosted checkout URLs.
- The credential migration disables only the three historically seeded admin identities **when their password still matches a published seed password**. It clears that password, removes admin privilege, and deletes refresh sessions/tokens. Rotated passwords and other identities are preserved.
- Hosted response headers add content-type protection, frame protection, referrer restrictions, and camera/microphone restrictions.

## Verification

The automated suite contains **33 regression tests**: 15 Deno endpoint/helper tests and 18 PostgreSQL tests. It exercises real endpoint handlers against a mocked Supabase HTTP boundary, plus real SQL/RLS/transactions in PGlite with fixtures for Supabase auth, Vault, and network delivery. The database fixture loads the relevant foundational and follow-up migrations; it does not emulate every Supabase service or execute the entire historical seed chain.

Checks: `npm run test`, `npm run typecheck`, and `npm run lint`. The test command now executes tests rather than only a cached build. Frontend production builds run TypeScript first. Backend typechecking checks every Edge Function; backend lint uses Deno's built-in linter with documented legacy rule exclusions in the check script. The root lint task currently covers the backend, not a full frontend lint audit.

Browser smoke checks on the built guest app confirmed sign-in accessible names, initial focus, forward/backward Tab containment, Escape close, focus restoration, keyboard footer buttons, separate vehicle actions, and a disabled guest emergency submission. No real bookings, payments, SMS, or email were sent during verification.

Hosted payment checkout, real email/SMS delivery, concurrent transactions across multiple database sessions, the complete deployed migration history, mobile/Android behavior, contrast, and screen-reader behavior still require staging verification. Automated tests do not certify those integrations.

## Rollout order

1. Establish a secure, recoverable admin account first. Historical `.local` seed addresses are not a reliable email recovery path. The credential migration will remove admin access from accounts still using published passwords; restore their admin role only after securing and verifying them.
2. Apply both new forward migrations in staging, then the hosted project through the normal Supabase migration workflow: `20261006120000_qa_booking_security.sql` and `20261006120100_disable_seeded_admin_passwords.sql`. The new frontend and functions require the new schema/RPCs. Deploying only the frontend will break booking creation and queries.
3. Set `ALLOWED_ORIGINS` to the exact supported frontend origins. Checkout return origins must be HTTPS. Configure the existing payment provider secrets and real account email delivery credentials. Set `PAYMONGO_MODE=live` for live PayMongo.
4. Set a strong `NOTIFICATION_DISPATCH_TOKEN` Edge Function secret. Store the same token in Vault as `notification_dispatch_token`, and the hosted dispatch-notification endpoint as `notification_dispatch_url`. The function has gateway JWT verification disabled because it validates this private token or an admin identity itself. Never put this token in the frontend.
5. Deploy the changed Edge Functions, then the frontend. Verify customer/admin/mechanic roles, actual checkout return and webhook replay, reservation expiry, cancellation, no-capacity dispatch, and notifications in staging before release.

## Remaining features and operational limits

- Real vehicle GPS, route-based ETA, freshness indicators, and a driver acceptance workflow remain future features. The UI no longer presents synthetic values as live data.
- The appointment buffer uses catalog duration plus 30 minutes. It does not implement a full mechanic shift, skills, leave, or travel-time scheduling engine.
- Paid cancellation/refunds and late-payment notifications require staff review. Automatic financial refunds and a dedicated reconciliation work queue remain future work.
- A provider timeout after the provider accepts a request is an uncertain outcome. The lease limits immediate duplicates; Stripe uses server-derived idempotency. PayMongo unknown outcomes and expired sessions still require provider reconciliation/support rather than a guaranteed automatic recovery claim.
- Full-value vouchers are rejected before saving an unpayable booking; a complimentary-booking workflow is not implemented.
- The entry bundle is smaller but remains large. Further vendor reduction, image optimization, Android testing, and a full accessibility audit remain useful follow-up work.
- Real support contact details, hours, service promises, and social links need business-owner verification. Existing configured business content was not treated as verified operational capacity.
- Local storage and localhost-specific improvements were intentionally not the focus, following the user's preference.

The original audit remains in `QA_REVIEW_2026-10-06.md`; it records the pre-change evidence and should not be read as a fresh test of the deployed system.

## Hosted deployment follow-up

- Applied `20261006120000_qa_booking_security.sql` and deployed all 11 Edge Functions to `reyghhsjiwyabhgbgubt`.
- Configured matching notification dispatch secrets in Edge Functions and Vault, and allowed both localhost preview origins alongside existing hosted frontend origins.
- At the owner's request, preserved the three seeded admin accounts. `20261006120100_disable_seeded_admin_passwords.sql` remains unapplied. A future blanket database push would include it; exclude it unless this decision changes.
- Switched ignored frontend `.env.local` to the existing hosted public configuration and retained its previous local backend settings in `.env.local.local-backend-backup`. Vite restarted successfully.
- Hosted catalog read returned HTTP 200; checkout preflight returned HTTP 200 with the correct localhost origin. Migration history and Vault names were verified, and admin count remains three. No real booking, payment, email, or SMS was submitted.
- Payment return validation still requires an approved HTTPS origin. HTTP localhost can browse and create bookings, but hosted checkout initiated with its default localhost return URL will be rejected. Full payment testing needs an approved HTTPS frontend.

Deployment decision: the owner explicitly retains the seeded admin accounts. The unapplied credential-disable migration was removed before release so normal database pushes preserve those accounts. Booking migration 20261006120000 remains in the deployment history.
