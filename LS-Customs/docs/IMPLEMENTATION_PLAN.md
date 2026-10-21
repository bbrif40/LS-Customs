# Customer and admin implementation plan

Source: the 2026-10-20 design interview, CONTEXT.md, and ADRs 0001–0020. Later decisions override earlier wording. Implement locally; deployment and provider credentials are separate from verification. Do not mark a phase complete without checking its customer, mechanic, admin, and authorization paths.

## Approach

Use the existing React screens, PostgreSQL transactions/RLS, Edge Functions, payment providers, notifications, and audit log. Keep one admin role. Store money as decimal PHP amounts in SQL and integer centavos in TypeScript. No project-owned .mjs files or new framework. Database rules enforce the same policies as the UI.

## 1. TypeScript tooling

- [x] Convert all 10 owned .mjs scripts/tests to .ts, update scripts/hooks/docs, verify native Node execution (40 existing regressions pass).
- [x] Keep third-party distribution files untouched. MapLibre 6 distributes its worker only as .mjs; retain this dependency import to avoid breaking maps. No project-owned .mjs files remain.

## 2. Transaction and account foundation

- [x] Versioned terms acceptance before rental/service/roadside/payment confirmation, including cash; save immutable accepted content and transaction reference.
- [x] Separate booking state, payment method, payment state, capacity holds, refund state, and outstanding debt.
- [x] Account charges, allocations, adjustments and audit records; private customer reads and authorized admin/mechanic writes.
- [x] Late return: admin-confirmed actual return, PHP250 per full late hour; correction reason/audit.
- [x] After fee posting: rental block immediately, reversible flag at 24h, PHP1000 at 48h then each full 24h until full payment/waiver. No compounding and no destructive user deletion.
- [x] Account balance UI, selected-charge payment/Pay all, 10-minute quote protection, late payment credits, cash receipts, waivers; all blocking debt must settle.

## 3. Rental checkout and identity

- [x] Pickup/return timestamps, 24-hour days; 8am–6pm Asia/Manila; admin exceptions.
- [x] Private driver-license upload during checkout (online/cash), owner/admin access only; approved through return date; reuse until expiry unless identity/license changes.
- [x] Vehicle hold during 1-hour review; unreadable re-upload keeps original timer; invalid/mismatched rejection releases hold.
- [x] Approval email, online payment deadline 3h after approval, expiry/release/email; full refund for payment after expiry.
- [x] Cash confirms after license approval, payment before handover; customer cancellation unavailable; admin cancellation allowed; pickup +3h no-show expiry and audited extensions.
- [x] Handover requires verified license, collected payment, condition report and customer acknowledgement.

## 4. Mechanic checkout and dispatch

- [x] Select online/cash; concurrent eligible-mechanic offers, 5-minute response; first valid acceptance wins atomically.
- [x] Accept before online checkout; immediate payment UI, confirmation on success; cash confirms on acceptance, due after service.
- [x] 10-minute online capacity hold, failed payment switch to cash within remaining time, no switch while processing, full refund after expiry.
- [x] Failed offer round: no payment/confirmation, release holds, retry/time/support, roadside admin alert.
- [x] Service radius configurable by admin (initially 100 km from Manila, reaching Bulacan and Cavite); fixed confirmed destination, approved location changes with coverage/price/capacity checks.
- [x] Scheduled/roadside 8am–6pm; allow travel plus duration before closing; active jobs can overrun with updates.
- [ ] Background real GPS while travelling, explicit permission/indicator, stop at arrival/cancel; failure does not block trip, admin alert; stale at 60s, last seen, no stale ETA. Native device background lifecycle needs device verification.

## 5. Cancellation, refunds and rescheduling

- [x] Paid mechanic cancellation request: preserve appointment pending admin review; 100% before travel, 45% during travel before work; after work support review. Provider cancellation/unavailable/time change: full refund or customer accepts new time.
- [x] Cash mechanic cancellation free before work; 3 customer cancellations in rolling 30 days -> admin review, not unpaid-fee flag.
- [x] Rental prepaid cancellation before handover full refund; early return no automatic refund.
- [x] Extension: availability, license through new end, approval/payment before existing deadline; each started extra 24h at daily rate.
- [x] Mechanic reschedule: fresh acceptance, preserve original until replacement/payment secured; refund decrease, collect increase; cash updates accepted amount. Reassignment preserves travel fee.

## 6. Work reports and damage disputes

- [x] Mechanic itemized extra quotes, direct customer approval/version, no unapproved charges; original work only if declined, support if blocked; online/cash after service; completion report with work/parts/photos/bill.
- [x] Rental handover/return photos/notes; versioned handover acknowledgement; return correction audit.
- [x] Damage estimate items/photos, 48h dispute from first successful notification, pending excluded from debt; admin finalization; online/cash settlement and rental block, no daily penalty.

## 7. Admin operations and notifications

- [x] Single-role admin action queue: license reviews, cancellations, failed refunds/delivery, debt, damage disputes; deadlines/urgency; claim/reassign shared access; duplicate action protection.
- [x] Financial actions: actor/time/amount/reason/before/after, immutable history.
- [x] Decision in-app + email with outcome/amount/deadline/link; no ID images; email failure does not roll back decision, retries and queue visibility.
- [x] Booking-linked support context; reopen same issue within 7 days, else new linked ticket.

## 8. Verification and release

- [ ] PostgreSQL tests for time boundaries, money, idempotency, competing acceptance, payment-after-expiry, and RLS negative cases for every new relation/RPC.
- [x] Typecheck/build frontend, Deno endpoint checks/tests/lint, Node SQL regression suites.
- [ ] Customer/admin/mechanic walkthrough using test accounts and payment sandbox; foreground/background GPS on Android.
- [x] Update DATABASE.md/API.md and deployment instructions.
- [ ] Apply additive migrations before corresponding endpoints/UI. Configure and verify expiry/penalty/delivery workers, provider refunds/email and private Storage policies on target environment.

## Execution log

Implementation started 2026-10-20. Checked implementation items have local code and regression coverage; they do not mean deployed or device-tested. Release checks below remain separate.


### 2026-10-21 continuation

- Added audited cash service balances and net collections, payment/ledger linking to prevent duplicate collection, and cash repayment/provider-refund reconciliation UI.
- Added private license supersession for future reuse, verified support-context insert protection, cancelled-change cleanup, admin pickup arrangements and active-service overrun alerts.
- Mechanic offers show service, city and appointment; blocked original work can be escalated. Expired checkout has a fresh-request action. Customer refund status is separate from cancellation approval.
- Updated public policy/FAQ text to match the approved cash/refund/late-fee rules. Converted all ten owned .mjs files to TypeScript; Vite also emits the third-party worker as .js without modifying its package.
- Verification: 53 Edge Function tests pass; all 17 endpoints typecheck. All 87 PostgreSQL regression tests pass, including the cancelled-extension cleanup regression. Web typecheck and production build pass. Large existing bundle warnings remain.
- Android Capacitor sync succeeds. Debug compilation needs JDK 21, which is absent (installed toolchains are 17 and 25). Background GPS still requires a physical Android device test.
- Local Supabase cannot run while Docker Desktop is stopped. A network-enabled retry verified the configured hosted admin login and admin role; the sandbox-only DNS failure was environmental. No production schema, payment, email, or account credentials were changed.
- Original seeded admin: admin@lscustoms.local / admin123. A network-enabled login and profile query confirmed these credentials currently work with the admin role. Before future deployment, note that migration 20261008140000 disables exposed seed passwords and removes their admin role. Privately rotated passwords are not recoverable from source. Do not remove that migration or silently restore a published password.

See [transaction deployment checklist](TRANSACTION_DEPLOYMENT.md) for the remaining environment and release verification.
