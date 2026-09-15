# LS Customs — Frontend Feature Proposal Plan
**Frontend-only enhancements connected to existing Supabase backend**
*Prepared: September 2026*

---

## Executive Summary

This document proposes a prioritized roadmap of frontend-only features and improvements for the LS Customs platform. All proposals connect exclusively to the existing Supabase backend (PostgREST tables, RPC functions, and Edge Function invocations) — no backend changes are required.

**Three tiers of work:**
- **Tier A — Mock-to-live migrations:** AdminOverview, AdminRevenue, and AdminTechnicians currently consume static `adminData.ts` mocks. These are the highest-impact, lowest-effort wins.
- **Tier B — Customer-side enhancements:** Favorites sync, notification center depth, booking history polish, and live location improvements.
- **Tier C — Admin-side polish on already-connected components:** Retry-payment completion, admin phone/address editing, booking detail live location subscription, and mechanic schedule availability.

---

## Tier A: Mock-to-Live Migrations (Highest Priority)

### A1. AdminOverview — From Static Mock to Live Dashboard

**Current state:** `AdminOverview.tsx` imports `overviewStats`, `technicians`, and `recentBookings` from `data/adminData.ts`. The map is CSS-only with hardcoded markers.

**Target:** Replace all three sections with live Supabase data.

#### Implementation Plan

**1. New hook: `useAdminOverviewStats()`**
- **File:** `apps/web/src/hooks/useAdminOverviewStats.ts` (new)
- **Queries needed:**
  - Total revenue (last 7 days): `supabase.from('payments').select('amount').eq('status', 'succeeded').gte('created_at', ...)` → sum client-side
  - Active rentals count: `supabase.from('vehicle_bookings').select('id', { count: 'exact', head: true }).in('status', ['pending', 'confirmed', 'assigned', 'en_route', 'in_progress'])`
  - Pending service bookings (by status): `supabase.from('service_bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending')`
  - Fleet utilization: active vehicles / total vehicles from `vehicles` table (sum of `rating_count` as booking proxy, or count active + rented via current bookings)
- **Realtime:** Subscribe to `payments` UPDATE and `vehicle_bookings`/`service_bookings` status changes for live stat updates.
- **Trend:** Compute percentage change vs. previous 7-day window.

**2. New hook: `useLiveTechnicians()`**
- **File:** `apps/web/src/hooks/useLiveTechnicians.ts` (new)
- **Queries needed:**
  - `mechanic_profiles` joined with `profiles` (name, avatar) — same pattern as `useAdminMechanics`
  - Filter `is_available = true`
  - Map `current_lat`/`current_lng` into `MapPin[]` for the live service map
  - Map `is_available` → status badge: `true` = 'available', `false` = 'unavailable'
- **Realtime:** Subscribe to `mechanic_profiles` UPDATE for live availability + location changes.
- **Map pins:** Convert mechanic geo coordinates to `MapPin[]` format and feed into existing `<MapView>` component (already lazy-loaded and ready).

**3. New hook: `useRecentBookings(limit=5)`**
- **File:** `apps/web/src/hooks/useRecentBookings.ts` (new)
- **Queries needed:**
  - `vehicle_bookings` joined with `profiles` + `vehicles` → map to `{ serviceType, customer, status, price, icon }`
  - `service_bookings` joined with `profiles` + `service_booking_items.mechanic_services` → same shape
  - Union both, order by `created_at DESC`, limit
- **Shape mapping:**
  - Vehicle booking → `{ serviceType: "Rental - {vehicle.name}", serviceId: "VS-{plate}", customer: profile.full_name, status: ..., price: "₱{total_price}", icon: '🚗' }`
  - Service booking → `{ serviceType: "🔧 {service name}", serviceId: "LSC-{id.slice(0,8)}", customer: profile.full_name, status: ..., price: "₱{total_price}", icon: '🔧' }`

**4. Component replacement: `AdminOverview.tsx`**
- Remove imports of `overviewStats`, `technicians`, `recentBookings` from `adminData.ts`
- Import new hooks: `useAdminOverviewStats`, `useLiveTechnicians`, `useRecentBookings`
- Replace CSS-only map with `<MapView>` using technician pins from `useLiveTechnicians`
- Replace static technician list with real mechanic profiles from `useLiveTechnicians`
- Replace static bookings table with `useRecentBookings` data
- Keep "Manage Schedule" CTA button (navigates to `onViewChange('mechanics')`)

**Files to create:** 3 hooks
**Files to modify:** `AdminOverview.tsx`
**Effort:** Medium (8–10 hours)

---

### A2. AdminRevenue — From Static Chart to Live Financial Dashboard

**Current state:** `AdminRevenue.tsx` imports `revenueStats`, `revenueChartData`, and `transactions` from `adminData.ts`. SVG chart is hand-rolled. Date range selector and CSV export are non-functional.

**Target:** Wire to live `payments` table with date filtering and working CSV export.

#### Implementation Plan

**1. New hook: `useAdminRevenueData(dateRange?: { start: string; end: string })`**
- **File:** `apps/web/src/hooks/useAdminRevenueData.ts` (new)
- **Queries needed:**
  - All payments in date range: `supabase.from('payments').select('booking_type, booking_id, amount, status, created_at').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true })`
  - Sum by day, split by `booking_type` ('vehicle' vs 'service') for the chart
  - Total revenue, AOV (avg per transaction), and active "subscriptions" (mechanics with active service bookings in the period)
- **Date range:** Accept a `{ start, end }` pair; default to last 30 days. The component's date-range button controls this.
- **Trend:** Compare current period to previous period for the stat card trend indicators.

**2. Component replacement: `AdminRevenue.tsx`**
- Remove imports from `adminData.ts`
- Import `useAdminRevenueData`
- Replace `revenueChartData` with computed daily buckets from live payments
- Feed daily data into the existing SVG chart builder (reuse the `buildPath` / `toPoint` / `gridLines` logic already there)
- Make the date-range button open a date picker (native `<input type="date">` is sufficient for a frontend-only change — it just feeds params to the hook)
- Make "Export CSV" download a blob built from the payments array (no backend needed)
- Replace the mock transactions table with the live payments query results

**Files to create:** 1 hook
**Files to modify:** `AdminRevenue.tsx`
**Effort:** Medium (6–8 hours)

---

### A3. AdminTechnicians — From Static Schedule to Live Scheduling Grid

**Current state:** `AdminTechnicians.tsx` imports `scheduleBlocks`, `scheduleTechnicians`, and `unassignedJobs` from `adminData.ts`. The timeline is CSS-grid with no data binding.

**Target:** Render real service bookings as schedule blocks, real technicians as rows, and real unassigned (pending) jobs.

#### Implementation Plan

**1. New hook: `useTechnicianSchedule(date?: string)`**
- **File:** `apps/web/src/hooks/useTechnicianSchedule.ts` (new)
- **Queries needed:**
  - Pending service bookings (unassigned jobs): `supabase.from('service_bookings').select('id, scheduled_at, status, total_price, addresses!left(line1, city)').eq('status', 'pending').order('scheduled_at')`
  - Service bookings with mechanics assigned, for today: `supabase.from('service_bookings').select('id, mechanic_id, scheduled_at, status, mechanic_profiles!inner(profiles!inner(full_name))').eq('status', 'in_progress').gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)`
  - Available mechanics: `supabase.from('mechanic_profiles').select('id, current_lat, current_lng, profiles!inner(full_name, phone)').eq('is_available', true)`

**2. Component replacement: `AdminTechnicians.tsx`**
- Remove imports from `adminData.ts`
- Import `useTechnicianSchedule`
- Map `scheduled_at` to timeline hour slots (existing `hours` array: 08:00–17:00)
- Render unassigned jobs from the pending query (each job → `{ title, vehicleInfo, address, urgency }`)
- Render schedule blocks from real bookings — color by mechanic
- Keep the CSS grid timeline structure; just feed it live data
- The "Add Shift" button remains a placeholder (no backend shift-management table exists yet)

**Files to create:** 1 hook
**Files to modify:** `AdminTechnicians.tsx`
**Effort:** Medium (6–8 hours)

---

## Tier B: Customer-Side Enhancements

### B1. Favorites Sync to Supabase

**Current state:** `useFavoriteVehicles.ts` stores favorites in `localStorage` only — no Supabase persistence, no cross-device sync, no server-side favorites.

**Proposed:** Create a `vehicle_favorites` table concept via the existing `profiles` table's `favorite_vehicle_ids` JSONB column — but wait, the schema doesn't have this. Instead, use a lightweight approach:

**Option A (no backend):** Keep localStorage but add export/import via browser share API.
**Option B (recommended):** Use the existing `reviews` table or `notifications` table as a proxy — no, this is semantically wrong.

**Actual recommendation:** Since the constraint is frontend-only, and the `profiles` table has no favorites column, the best approach is:

- Keep `useFavoriteVehicles` in localStorage
- Add a UI panel in the Profile page listing favorited vehicles (read from localStorage, display with real vehicle data from `useCustomerVehicles`)
- Add a "Share favorites" button that exports the list as JSON for cross-device transfer

**Files to modify:** `Profile.tsx` (add favorites section), `useFavoriteVehicles.ts` (add export function)
**Effort:** Low (2–3 hours)

---

### B2. Notification Center — Detail View + Bulk Actions

**Current state:** `useCustomerNotifications.ts` fetches 25 notifications with realtime INSERT. The notification UI is handled by `onNotify` toasts scattered across components.

**Proposed:**
1. **New component:** `NotificationCenter.tsx` — a dedicated page/section showing all notifications in a list with:
   - Unread count badge in the nav/header
   - Bulk "Mark all as read" button
   - Click-to-navigate: if `metadata.booking_type` is present, deep-link to the Bookings view and auto-open the matching booking
   - Infinite scroll or pagination beyond the initial 25

2. **Hook enhancement:** `useCustomerNotifications` already supports `markAsRead` and `markAllAsRead` — wire these to a list UI.

**Files to create:** `NotificationCenter.tsx`
**Files to modify:** `App.tsx` (add route), `useCustomerNotifications.ts` (optional: add pagination)
**Effort:** Medium (6–8 hours)

---

### B3. Booking History — Date-Range Filtering

**Current state:** `Bookings.tsx` already has tabs (Active / History) and type filters (Rentals / Services / Everything). No date range filtering.

**Proposed:**
- Add a date-range filter dropdown (native date inputs) that filters by `created_at`
- Add a "No bookings in this range" empty state
- Persist filter state in URL query params so the view is shareable

**Files to modify:** `Bookings.tsx`, `useCustomerBookings.ts` (add optional `dateRange` param)
**Effort:** Low (3–4 hours)

---

### B4. Customer Review Enhancement — Rating History List

**Current state:** Reviews are submitted via the `BookingDetailsModal` in `Bookings.tsx`. There's no way for a customer to see their past reviews.

**Proposed:**
- New hook: `useCustomerReviews(userId)` — queries `reviews` table filtered by `customer_id`, joined with `mechanic_services` / `vehicles` for context
- New section in `Profile.tsx`: "Your Reviews" — a scrollable list showing rating stars, service/vehicle name, date, and comment
- Allow editing the comment within 24 hours (same constraint already in the modal)

**Files to create:** `useCustomerReviews.ts`
**Files to modify:** `Profile.tsx`
**Effort:** Low-Medium (4–5 hours)

---

### B5. Live Location — Map Polishing

**Current state:** `useLiveLocationForActiveBooking.ts` streams GPS to `service_bookings.current_lat/lng`. The customer's `Bookings.tsx` shows a "View live map" button that opens a map with the pin. The live location is already stored in the DB.

**Proposed improvement:**
- In `Bookings.tsx`, when viewing a service booking card that has `mechanic_id` assigned, render a small inline map preview (mini-map) showing the mechanic's location relative to the service pin — using `<MapView>` with reduced height
- Add a "Tap for turn-by-turn" link that opens Google Maps with directions from the mechanic's location to the pin

**Files to modify:** `Bookings.tsx`
**Effort:** Low (2–3 hours)

---

## Tier C: Admin-Side Polishing Improvements

### C1. AdminTransactions — Complete Retry-Payment Flow

**Current state:** `AdminTransactions.tsx` and `handleRetry()` show `window.alert('Retry link feature coming soon')`. The `useAdminPayments` hook doesn't expose a `retry` action.

**Proposed:**
1. **Hook enhancement:** Add `retryPayment(payment)` to `useAdminPayments.ts` — calls `create-payment-intent` Edge Function with `{ booking_type, booking_id }`, then returns `{ payment_id, client_secret, provider, amount, currency }`
2. **UI enhancement:** Replace the alert with a modal that:
   - Shows the original payment amount and provider
   - Explains that clicking "Generate retry link" will create a new payment intent
   - On confirm, calls `retryPayment` and shows a copyable link or QR code that the customer can use
   - Alternatively, since we can't send emails from the frontend, show a "Copy retry link" button that generates `app://retry/{payment_id}` and copies it to clipboard

**Files to modify:** `useAdminPayments.ts`, `AdminTransactions.tsx`
**Effort:** Medium (4–6 hours)

---

### C2. AdminUsers — Inline Phone Editing

**Current state:** `AdminUsers.tsx` is read-only for phone and address. The comment in the file says "Phone and address are still read-only on this screen."

**Proposed:**
- Make phone editable inline: each row gets an edit icon → input field → save on blur or Enter
- Use the existing `updateUserPhone(userId, phone)` function already in `useAdminData.ts`
- Add optimistic UI update (immediately reflect the new phone, rollback on error)
- Show a toast confirmation via the existing `onNotify` pattern (the parent `App.tsx` could pass an `onNotify` prop)

**Files to modify:** `AdminUsers.tsx`
**Effort:** Low (3–4 hours)

---

### C3. AdminBookingDetail — Live Location Realtime Subscription

**Current state:** `AdminBookingDetail.tsx` receives `current_lat`/`current_lng` as props from the parent `AdminBookings` component. These are static at the time of fetch — no realtime subscription.

**Proposed:**
- Subscribe to `service_bookings` UPDATE for the specific booking ID via `supabase.channel('service-bookings:live:{bookingId}')`
- When `current_lat`/`current_lng` change in the realtime stream, update the map pin position
- Already partially set up — the parent fetches `current_lat`/`current_lng` in the initial query; just needs a realtime channel wrapper

**Files to modify:** `AdminBookingDetail.tsx`
**Effort:** Low (2–3 hours)

---

### C4. AdminMechanics — Availability Toggle + Schedule View

**Current state:** `AdminMechanics.tsx` shows a table of mechanics with their `is_available` status. Can deactivate (sets `is_available = false` permanently). No way to toggle availability for a shift.

**Proposed:**
1. **Availability toggle:** Add a quick toggle switch per mechanic row that flips `is_available` via `updateMechanic(id, { is_available: !current })`
2. **Schedule column:** Add a "Today's schedule" preview in the table — fetch today's `service_bookings` for each mechanic (query by `mechanic_id IN (...)` grouped by `mechanic_id`), show count of jobs + a simple time list

**Files to modify:** `AdminMechanics.tsx`, `useAdminData.ts` (optional: add `useMechanicSchedule` helper or extend `useAdminMechanics`)
**Effort:** Medium (5–6 hours)

---

### C5. AdminBookings — Auto-Assignment via Edge Function

**Current state:** `AdminBookings.tsx` has a manual "Assign ▾" dropdown for pending service bookings that writes `mechanic_id` + `status: 'assigned'` directly via PostgREST UPDATE.

**Proposed:**
- Add an "Auto-assign" button that calls the `assign-mechanic` Edge Function with `{ booking_id }`
- The edge function already exists and uses Haversine distance to find the nearest available mechanic
- Show the assigned mechanic in a toast before refreshing the table

**Files to modify:** `AdminBookings.tsx`
**Effort:** Low (2–3 hours)

---

## Detailed Priority Matrix

| Priority | Initiative | Tier | Type | Est. Effort | Backend Dependency |
|----------|-----------|------|------|-------------|-------------------|
| P0 | AdminOverview → live stats + map + bookings | A | Mock→Live | 8–10h | payments, vehicle_bookings, service_bookings, mechanic_profiles |
| P0 | AdminRevenue → live payments + chart + CSV | A | Mock→Live | 6–8h | payments table |
| P0 | AdminTechnicians → live schedule + unassigned | A | Mock→Live | 6–8h | service_bookings, mechanic_profiles, addresses |
| P1 | AdminTransactions → complete retry flow | C | Polish | 4–6h | create-payment-intent Edge Function |
| P1 | AdminUsers → inline phone editing | C | Enhancement | 3–4h | profiles table update |
| P1 | AdminMechanics → availability toggle + schedule | C | Enhancement | 5–6h | mechanic_profiles + service_bookings |
| P2 | Customer notification center | B | New feature | 6–8h | notifications table |
| P2 | Customer review history list | B | New feature | 4–5h | reviews table |
| P2 | Customer booking date-range filter | B | Enhancement | 3–4h | customer_bookings query |
| P3 | AdminBookingDetail → live location realtime | C | Enhancement | 2–3h | service_bookings realtime channel |
| P3 | AdminBookings → auto-assign button | C | Enhancement | 2–3h | assign-mechanic Edge Function |
| P3 | Customer favorites panel in Profile | B | Enhancement | 2–3h | localStorage + vehicles table |
| P3 | Customer mini-map on booking cards | B | Enhancement | 2–3h | MapView + mechanic location data |

---

## Technical Implementation Notes

### Supabase Realtime Patterns Already in Use
- `useAdminPayments` subscribes to `payments` UPDATE globally — follow this pattern for new realtime hooks
- `useCustomerNotifications` uses `channelKey` to disambiguate — replicate for new channels
- `usePaymentStatus` subscribes to single-row `payments` UPDATE — replicate for booking-detail live location

### PostgREST Join Patterns to Follow
- `useAdminServiceBookings` uses a **two-pass approach**: flat SELECT first, then 4 follow-up queries for profiles, mechanic_profiles, addresses, and line items. This avoids PostgREST schema-cache 400 errors on nested FK chains. Use the same pattern for new admin hooks.
- `useAdminVehicleBookings` does a **single SELECT with embeds** (`profiles!inner`, `vehicles!inner`) — works reliably for shallow joins.
- Supabase returns joined rows as **arrays** even for one-to-one relationships — always access via `?.[0]` (see `AdminBookingDetail` and `AdminUsers` patterns).

### Edge Function Integration
- `supabase.functions.invoke('function-name', { body: {...} })` returns `{ data: { data, error }, error }`
- Unwrap pattern: `(data as { data?: T; error?: { message: string } })?.data ?? data`
- All Edge Functions validate JWT and check `is_admin()` — frontend never needs to send auth tokens manually; the Supabase client includes the session automatically.

### File Structure
```
apps/web/src/
├── hooks/           # New hooks go here (one per feature)
│   ├── useAdminOverviewStats.ts
│   ├── useLiveTechnicians.ts
│   ├── useRecentBookings.ts
│   ├── useAdminRevenueData.ts
│   ├── useTechnicianSchedule.ts
│   └── useCustomerReviews.ts
├── components/
│   ├── admin/       # Modify existing admin components
│   └── views/       # Customer-facing components
└── data/adminData.ts  # Mark remaining exports as deprecated (or remove after migration)
```

### Error Handling Strategy
- All new hooks follow the existing `loading` / `error` / `refetch` pattern
- Follow-up join failures are non-fatal (see `useAdminServiceBookings` pattern)
- Graceful degradation: if a realtime channel fails to subscribe, the page still renders from the initial fetch and polls on next navigation

### Types
- Import from `@ls-customs/shared-types` for all DB row types (`Payment`, `Vehicle`, `MechanicProfile`, etc.)
- Extend existing type aliases (`MechanicWithProfile`, `VehicleBookingWithCustomer`) when adding joins
- Domain enums (`BookingStatus`, `PaymentStatus`, `TicketStatus`) live in `domain.types.ts` — reference rather than redefining

---

## Rollout Strategy

**Phase 1 (Week 1):** Migrate AdminOverview to live data — highest visual impact, the dashboard is the first thing admins see.

**Phase 2 (Week 2):** Migrate AdminRevenue and AdminTechnicians — revenue and scheduling are the other two mock screens.

**Phase 3 (Week 3):** Polish pass — AdminTransactions retry flow, AdminUsers inline editing, AdminMechanics availability toggle.

**Phase 4 (Week 4+):** Customer enhancements — notification center, review history, booking filters, live location mini-maps.

Each phase ships independently; all Tier A work must be completed before Tier B/C to ensure the dashboard is fully live.
