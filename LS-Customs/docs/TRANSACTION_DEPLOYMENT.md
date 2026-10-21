# Transaction release checklist

Implementation is local. No hosted migrations, real payments, refund payouts, emails or password changes were performed in this run. The checked plan items describe implementation, not production activation.

## Apply and configure

1. Use Node 24+. Start Docker Desktop before the existing local Supabase workflow. Apply the complete chronological migrations in staging, including `20261020120000` through `20261020230000`, before deploying the corresponding functions/UI. Do not apply a single migration to an older schema in isolation. `node apply_migration.ts <migration-file>` is for an explicitly selected local migration only, not a replacement for migration history.
2. Confirm private Storage buckets `driver-licenses` (10 MB JPEG/PNG/WebP/PDF) and `booking-evidence` (private image evidence), owner/assigned-mechanic/admin policies, and rejection of anonymous reads. Existing private objects must not become public.
3. Service-radius verification uses database coordinates and needs no geocoding key. Preserve the existing payment-provider keys, signed webhook secret and approved checkout origins. Never place service-role, worker or provider secrets in the web bundle. Configure verified email delivery with `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`.
4. Deploy the changed functions, including `account-payment`, `verify-service-location`, `operations-worker`, `booking-route`, `create-payment-intent`, `assign-mechanic`, `refund-payment` and `payment-webhook`. Configure `OPERATIONS_WORKER_TOKEN`. The worker has `verify_jwt=false` because it authenticates its own private token.
5. In Supabase Vault, set `operations_worker_url` to the deployed `/functions/v1/operations-worker` URL and `operations_worker_token` to that same private token. Keep the existing notification-dispatch Vault configuration. Migration `20261020151000_operations_schedule.sql` uses pg_cron/pg_net to invoke the worker every minute; inspect cron runs and network responses on the target. No secrets belong in committed SQL.
6. Publish a new terms version for later policy changes; accepted content is immutable. Confirm the production booking URL used by `notify_workflow` matches the actual deployment. Configure supported areas and scheduled/roadside hours in Admin service settings.
7. Build the web app, run `npx cap sync android` inside `apps/web`, then compile Android with **JDK 21** and the configured Android SDK. The installed JDKs 17/25 do not satisfy the geolocation plugin's requested Java 21 toolchain. Capacitor sync succeeded; Android compilation and physical-device GPS verification remain open.

## Verification commands

From the repository root:

```powershell
npm run build --workspace=apps/web
```

From `apps/backend`:

```powershell
node scripts/check-functions.ts check
node scripts/check-functions.ts lint
node scripts/check-functions.ts test
node --test --test-concurrency=2 scripts/*.test.ts
node scripts/check-secrets.ts
```

The secret scanner requires a working Git checkout/index. This workspace's Git configuration refers to an unavailable parent checkout; the scanner cannot currently verify staged changes. Do not weaken it to bypass that environment issue. No owned `.mjs` sources remain; the MapLibre dependency is untouched and Vite emits its worker asset as `.js`.

## Staging walkthrough still required

- Two isolated customer accounts, an assigned mechanic and an admin: verify tenant isolation, private evidence, versioned terms, all money-changing RPCs and direct-write rejection.
- Rental: license pending/unreadable/rejected/approved, original review timer, three-hour online expiry, cash before handover, arrival/no-show/extension, after-hours arrangement, latest report acknowledgement, actual return and 59/60/119/120-minute late-fee boundaries.
- Account: immediate rental block, flag at 24 hours, first PHP1000 at 48 hours, selected vs Pay all, ten-minute quote protection, partial/late payment, cash/waiver/reversal and automatic flag clearing after all blocking debt settles.
- Mechanic: concurrent five-minute offers, first acceptance only, cash confirmation, online checkout/ten-minute capacity, failure-to-cash switch, no switch while processing, expiry/late success, near-closing travel eligibility, active overrun alerts and fresh-request retry.
- Refunds: full before travel, 45% en route before work, support after work; prepaid rental before handover, provider cancellation, partial refund webhook, pending/failed provider result, verified provider reconciliation and actual cash repayment receipt. Confirm net collections and no duplicate cash collection after online account settlement.
- Changes/reports: approved extension paid before original deadline, replacement acceptance and price difference, original preserved on expiry/decline, cancelled-change capacity released, fixed destination until approved, exact itemized extras acceptance, damage dispute notification/48-hour window and admin finalization.
- Delivery/support: outcome/amount/deadline/link in app and email, simulated email failure leaves decision intact and produces retries/queue items, no ID image in email, seven-day reopen and later linked ticket.
- Android device: explicit location/notification permissions, persistent travel indicator, foreground/background/app-switch location updates, denied permission/network loss alert, stale fix at 60 seconds without ETA, stop on arrival/cancellation and screen cleanup. Browser tracking is foreground-only. Do not label native background tracking verified until this passes.

## Admin access

Historical seed login: `admin@lscustoms.local` / `admin123`. Migration `20261008140000_disable_seeded_admin_passwords.sql` disables published seed-password matches and removes their admin roles, preserving privately rotated credentials. Source code cannot reveal a rotated password. On 2026-10-21, a network-enabled authentication check against the configured hosted project confirmed that `admin@lscustoms.local` / `admin123` currently signs in and its profile role is `admin`. The earlier sandbox DNS failure was environmental. Local Docker remains stopped. Applying the credential-disable migration to a target still using this published password would disable it; privately rotate and verify owner access before release. Recover the owner-controlled account through the target Supabase project's authenticated administration if needed; do not restore a published password as a migration side effect.

## Implementation limits

Roadside eligibility uses a conservative straight-line estimate (20 km/h plus ten minutes, minimum thirty), recalculated at acceptance. It is not a traffic ETA. Real tracking routes use fresh mechanic GPS and the fixed confirmed destination. Replace the eligibility estimate with a route-provider duration when traffic precision becomes necessary.

Provider integration references: [PayMongo idempotent requests](https://docs.paymongo.com/reference/idempotent-requests), [PayMongo refunds](https://docs.paymongo.com/reference/refund-resource), [Stripe refunds](https://docs.stripe.com/api/refunds), [background geolocation plugin](https://github.com/capacitor-community/background-geolocation/blob/master/README.md).
