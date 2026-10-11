# Frontend redesign verification

Completed 11 October 2026 using the approved frontend design plan.

## Running locally

- Customer: http://localhost:5174/
- Admin: http://127.0.0.1:5174/admin
- Vite uses the existing local Supabase configuration through process environment variables. Existing environment files were not changed.
- Both sides were authenticated with existing local accounts. Separate hostnames preserve their independent browser sessions.

## Changes

Unified customer and admin typography, green brand palette, spacing, buttons, focus states and responsive layouts. Customer home prioritizes the next booking action and clear service/rental entry points. Booking steps consistently show six steps. Admin overview emphasizes operational shortcuts and real data; booking records adapt to phone screens and details use accessible light drawers. Mobile admin navigation supports focus containment, Escape dismissal and focus restoration. Fonts are hosted locally with their license.

Existing navigation and business handlers are preserved. No backend files, database schema or credentials were changed.

## Verification

- Production build: `npm run build --workspace=apps/web` passed TypeScript and Vite.
- Frontend patch: `git diff --check` passed. Backend diff was empty.
- Customer main navigation and all nine admin sections rendered without JavaScript errors during navigation checks.
- Responsive geometry checked at 360, 390, 768, 1024 and 1440 pixels across customer/admin checks; primary content fit the viewport without document horizontal overflow.
- Admin booking details dismissal restored focus. Phone navigation Escape dismissed its dialog and restored focus to Open navigation at 390 pixels.
- Customer mechanic flow checked through category, service, schedule and location using local catalog data. Final booking submission, payment, email retries, password changes and destructive admin actions were not performed.

## Existing local limitations

The local database is missing `public.vehicle_bookings.hold_expires_at`, which the existing customer booking query requires. Customer booking history and the home booking summary therefore show an unavailable state. This remains a backend/data setup issue and was not changed under the frontend-only scope.

The production build still reports a large JavaScript chunk warning (main bundle approximately 1.46 MB before gzip). Build succeeds; bundle splitting remains a separate performance task.

## Screenshots

- `../artifacts/frontend-redesign/customer-desktop.png`
- `../artifacts/frontend-redesign/admin-desktop.png`
- `../artifacts/frontend-redesign/admin-mobile.png`

## Recovery and workload refinement

The approved follow-up adds truthful customer recovery with Retry, preserved snapshots during failed refreshes, and timestamps from successful fetches. Admin metrics, mechanic availability and recent bookings now have separate recovery controls. Workload counters expose loading and failure so zero is only presented as a healthy empty state after successful queries. Overview DOM order is workload, recent bookings, mechanics, compact metrics and expandable map.

Validation: production build and frontend diff checks passed. `node artifacts/frontend-redesign/recovery-check.cjs` passed customer snapshot/loading/error/empty recovery and independent success/failure/retry checks for all three admin hooks using isolated mocked requests. Live customer Retry and admin map disclosure were checked. Customer and admin phone geometry at 390px matched document width without horizontal overflow. Existing database limitation and bundle warning remain as described above.

New proof captures: `admin-workload-desktop.png`, `admin-workload-mobile.png` and `customer-recovery-mobile.png` in the same artifact directory.
