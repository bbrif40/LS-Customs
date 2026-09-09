# SPEC.md — LS Customs Backend Specification

> **Stack:** Ionic Framework (frontend, built later) · Supabase/PostgreSQL (backend) · Vercel (deployment + edge functions)
> **Status:** Backend-first build. No frontend work happens until this spec and the schema it drives are implemented and verified.

---

## 1. Product Summary

**LS Customs** is a two-sided marketplace app that combines:

1. **Vehicle Rental** — customers book cars (short-term, extended/weekly-monthly, or premium/luxury) for self-drive use.
2. **Mobile Mechanic Services** — customers request a mechanic to come to their location (home, office, roadside) to perform maintenance, diagnostics, or repairs, instead of driving to a shop.

The unifying idea is "automotive help that comes to you" — renting a vehicle or getting one fixed should both be as easy as booking a ride-hail trip.

### 1.1 Core Purpose

Give customers a single app to (a) rent a vehicle when they need one and (b) get a vetted mechanic dispatched to their location when their own vehicle needs work — with transparent pricing, real booking status, and a trust layer (reviews/ratings) that lets the business scale beyond word-of-mouth.

### 1.2 Why This Needs a Real Backend

- Bookings must never double-book a vehicle or a mechanic — this requires transactional integrity, not client-side checks.
- Customer data (addresses, phone 
numbers, payment references) and mechanic location data are sensitive — access must be enforced at the database level (RLS), not just hidden in the UI.
- Matching a service request to an available, nearby mechanic and keeping booking status in sync (pending → assigned → en route → in progress → completed) is a server-side workflow, not a UI concern.

---

## 2. User Personas

| Persona | Description | Primary Goals |
|---|---|---|
| **Customer** | A vehicle owner or renter who books rentals and/or mechanic visits. Ranges from tech-savvy renters to elderly/non-technical users who "just want the car fixed without understanding it." | Book a rental fast; request a mechanic without diagnosing the problem themselves; track status; pay safely; leave/read reviews. |
| **Mechanic (Provider)** | A vetted, employed or partnered technician who receives service requests, travels to the customer, and updates job status. | See nearby/assigned jobs; update availability and location; mark job progress; get paid reliably. |
| **Fleet/Rental Staff** | Internal staff managing the rental vehicle catalog and availability (may overlap with Admin in v1). | Keep vehicle listings accurate; see upcoming pickups/returns. |
| **Admin** | LS Customs staff who operate the platform. | Manage users, vehicles, service catalog, mechanic roster; resolve disputes; view all bookings and payments. |

---

## 3. User Stories

### Customer
- As a customer, I can sign up and log in so my bookings and vehicle/service history are saved to my account.
- As a customer, I can browse rental vehicles by category (Short-term, Extended, Premium/Luxury) and see price, availability, and specs.
- As a customer, I can book a vehicle for a date range and see the total price before confirming.
- As a customer, I can browse the mechanic service catalog (e.g., Routine Fluid Service, Tire & Wheel Care, Electrical & Battery Care, Diagnostic Repair, Lighting & Visibility, Quick Fixes) without needing to know what's technically wrong with my car.
- As a customer, I can request one or more mechanic services at a saved address or a pinned location, and get matched with an available mechanic.
- As a customer, I can track my booking status (pending, mechanic assigned, en route, in progress, completed, cancelled).
- As a customer, I can view my booking/payment history.
- As a customer, I can leave a rating and review after a completed rental or service.
- As a customer, I receive notifications when my booking status changes.

### Mechanic
- As a mechanic, I can log in and see jobs assigned to me.
- As a mechanic, I can update my availability and current location.
- As a mechanic, I can update a job's status as I progress through it.
- As a mechanic, I can see my rating and past completed jobs.

### Admin
- As an admin, I can add/edit/deactivate rental vehicles and mechanic services.
- As an admin, I can view and manage all bookings, users, and mechanics.
- As an admin, I can see flagged reviews or disputes.

---

## 4. Functional Requirements (Backend Scope)

1. **Authentication & Profiles** — Email/password auth via Supabase Auth; a `profiles` row auto-created per user via trigger; role-based access (`customer`, `mechanic`, `admin`).
2. **Vehicle Catalog** — CRUD for rental vehicles across 3 main categories × 3 sub-categories, with availability derived from confirmed bookings.
3. **Rental Booking Engine** — Create/confirm/cancel a rental booking for a date range without double-booking a vehicle.
4. **Mechanic Service Catalog** — CRUD for services across 6 sub-categories under Mobile Maintenance and On-Site Diagnostics & Repair.
5. **Service Booking & Dispatch** — Create a service booking with one or more service line items, at a customer address/location, and assign an available mechanic (via Edge Function logic).
6. **Status Workflow** — Enforced status transitions for both booking types, updatable only by authorized roles (customer for cancel, mechanic/admin for progress states).
7. **Reviews & Ratings** — One review per completed booking; aggregate rating rolled up to vehicles and mechanics via trigger.
8. **Notifications** — In-app notification records generated on booking/status events, deliverable to the frontend via realtime subscription.
9. **Payments (records only)** — Store payment intent/status/reference per booking; actual payment processing happens through a provider (e.g., Stripe/PayMongo) called from an Edge Function; raw card data never touches our database.
10. **Row Level Security** — Every table enforces access rules so a user can only see/modify what their role permits, verified independent of frontend code.

---

## 5. In Scope (Initial Backend Version)

- Supabase Postgres schema: profiles, vehicles, vehicle_bookings, mechanic_profiles, mechanic_services, service_bookings, service_booking_items, addresses, reviews, notifications, payments.
- RLS policies for `customer`, `mechanic`, `admin` roles on every table.
- Auth trigger: auto-create `profiles` row on signup.
- Rating rollup triggers (vehicle & mechanic average rating).
- `updated_at` maintenance triggers.
- Edge Functions: mechanic auto-assignment, payment intent creation, payment provider webhook handler, notification dispatch.
- Seed data matching the LS Customs catalog (3 rental categories, 6 mechanic service sub-categories) for local development/testing.
- Local Supabase CLI setup, migrations, and Vercel deployment documentation.

## 6. Out of Scope (Explicitly Deferred)

- Ionic frontend UI/UX implementation (tracked separately, starts only after backend sign-off).
- Real-time GPS mechanic tracking map rendering (backend will store lat/lng; live map UI is a frontend-later concern).
- Native push notifications (APNs/FCM) — v1 ships in-app notification rows + Supabase Realtime only; push delivery is a future integration.
- AI-powered vehicle diagnostics / chatbot triage (mentioned as a 3–5 year roadmap item in the business proposal, not v1).
- Multi-currency / multi-region support.
- Partner/dealer portals and third-party integrations (insurance, dealerships).
- Loyalty programs, promo codes, and referral systems.
- Admin analytics dashboards (data will be queryable, but no dedicated reporting layer yet).
- Automated payroll/payout system for mechanics (payment *records* are in scope; payout automation is not).

---

## 7. Success Criteria for the Backend Phase

- A developer can run `supabase start`, apply migrations, seed data, and get a fully working local Postgres instance matching this spec.
- Every table has RLS enabled with policies that pass the test scenarios in `PHASES.md`'s acceptance criteria.
- A rental booking and a service booking can each be created end-to-end via direct SQL/API calls (Postman/psql) without touching any frontend code, respecting all constraints (no double-booking, correct status transitions, correct visibility per role).
- Edge Functions deploy successfully and are callable from Vercel and from Supabase's own function runtime.
