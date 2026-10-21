import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('sidebar testimonial RPC returns sanitized reviews from completed purchases only', async () => {
  const db = new PGlite()
  const customerId = '10000000-0000-4000-8000-000000000001'
  const adminId = '10000000-0000-4000-8000-000000000099'
  const mechanicId = '10000000-0000-4000-8000-000000000088'
  const vehicleId = '30000000-0000-4000-8000-000000000001'
  const vehicleBookingId = '40000000-0000-4000-8000-000000000001'
  const vehicleReviewId = '20000000-0000-4000-8000-000000000001'
  const serviceBookingId = '50000000-0000-4000-8000-000000000001'
  const serviceReviewId = '20000000-0000-4000-8000-000000000002'
  const oldestExtraReviewId = '70000000-0000-4000-8000-000000000001'

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create type public.booking_type as enum ('vehicle', 'service');
      create type public.booking_status as enum ('pending', 'completed');
      create table public.vehicles (id uuid primary key, name text not null);
      create table public.mechanic_services (id uuid primary key, name text not null);
      create table public.vehicle_bookings (
        id uuid primary key, vehicle_id uuid not null, customer_id uuid not null,
        status public.booking_status not null
      );
      create table public.service_bookings (
        id uuid primary key, customer_id uuid not null, status public.booking_status not null
      );
      create table public.service_booking_items (
        id uuid primary key, service_booking_id uuid not null, mechanic_service_id uuid not null
      );
      create table public.reviews (
        id uuid primary key, booking_type public.booking_type not null, booking_id uuid not null,
        customer_id uuid not null, target_vehicle_id uuid, target_mechanic_id uuid,
        rating smallint not null, comment text, created_at timestamptz not null
      );
      alter table public.reviews enable row level security;
      grant select on table public.reviews to public, anon, authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function public.is_admin() returns boolean language sql stable as $$ select auth.uid() = '${adminId}'::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into public.vehicles values ('${vehicleId}', 'Toyota Vios');
      insert into public.mechanic_services values
        ('60000000-0000-4000-8000-000000000001', 'Oil Change'),
        ('60000000-0000-4000-8000-000000000002', 'Battery Check');
      insert into public.vehicle_bookings values
        ('${vehicleBookingId}', '${vehicleId}', '${customerId}', 'completed'),
        ('40000000-0000-4000-8000-000000000002', '${vehicleId}', '${customerId}', 'pending'),
        ('40000000-0000-4000-8000-000000000003', '${vehicleId}', '${customerId}', 'completed');
      insert into public.service_bookings values
        ('${serviceBookingId}', '${customerId}', 'completed');
      insert into public.service_booking_items values
        ('61000000-0000-4000-8000-000000000001', '${serviceBookingId}', '60000000-0000-4000-8000-000000000001'),
        ('61000000-0000-4000-8000-000000000002', '${serviceBookingId}', '60000000-0000-4000-8000-000000000002');
      insert into public.reviews values
        ('${vehicleReviewId}', 'vehicle', '${vehicleBookingId}', '${customerId}', '${vehicleId}', null, 1,
          'The rental was reliable. Email ana@example.test, call +63 917 555 0101, coordinates 14.599500, 121.044600, 123 Main Street, ref 33333333-3333-3333-3333-333333333333.', '2026-05-01T00:00:00Z'),
        ('${serviceReviewId}', 'service', '${serviceBookingId}', '${customerId}', null, null, 5,
          'Quick service and clear communication.', '2026-05-02T00:00:00Z'),
        ('20000000-0000-4000-8000-000000000003', 'vehicle', '40000000-0000-4000-8000-000000000002', '${customerId}', '${vehicleId}', null, 4,
          'Pending bookings do not count.', '2026-06-01T00:00:00Z'),
        ('20000000-0000-4000-8000-000000000004', 'vehicle', '40000000-0000-4000-8000-000000000003', '${customerId}', '${vehicleId}', null, 3,
          '   ', '2026-06-02T00:00:00Z');
    `)

    for (let index = 1; index <= 11; index += 1) {
      const suffix = String(index).padStart(12, '0')
      const bookingId = `80000000-0000-4000-8000-${suffix}`
      const reviewId = `70000000-0000-4000-8000-${suffix}`
      await db.query("insert into public.vehicle_bookings values ($1, $2, $3, 'completed')", [bookingId, vehicleId, customerId])
      await db.query(
        "insert into public.reviews values ($1, 'vehicle', $2, $3, $4, null, $5, $6, $7)",
        [reviewId, bookingId, customerId, vehicleId, index % 5 + 1, `Review ${index}`, `2026-02-${String(index).padStart(2, '0')}T00:00:00Z`],
      )
    }

    await db.exec(await readFile(new URL('../supabase/migrations/20261018150000_public_sidebar_testimonials.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261018151000_preserve_admin_review_access.sql', import.meta.url), 'utf8'))

    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.reviews'), /permission denied/i)
    const { rows } = await db.query('select * from public.get_sidebar_testimonials()')
    await db.exec('reset role')

    assert.equal(rows.length, 10)
    assert.deepEqual(Object.keys(rows[0]).sort(), ['acquired_label', 'comment', 'rating', 'review_id', 'reviewer_label'])
    assert.ok(rows.every(row => row.reviewer_label === 'Verified customer'))
    assert.ok(rows.some(row => row.review_id === vehicleReviewId && row.rating === 1), 'low ratings remain eligible')
    assert.ok(rows.some(row => row.review_id === serviceReviewId && row.acquired_label === 'Service · Battery Check, Oil Change'))
    assert.ok(!rows.some(row => row.review_id === oldestExtraReviewId), 'newest 10 reviews are returned')
    assert.ok(!rows.some(row => row.comment.includes('Pending bookings')))
    assert.ok(!rows.some(row => row.comment.trim() === ''))

    const vehicleReview = rows.find(row => row.review_id === vehicleReviewId)
    assert.equal(vehicleReview.acquired_label, 'Rental · Toyota Vios')
    for (const privateValue of [
      'ana@example.test',
      '917 555 0101',
      '14.599500',
      'Main Street',
      '33333333-3333-3333-3333-333333333333',
    ]) {
      assert.ok(!vehicleReview.comment.includes(privateValue), `comment should omit ${privateValue}`)
    }

    await db.exec(`select set_config('request.jwt.claim.sub', '${customerId}', false); set role authenticated;`)
    const ownReview = await db.query(
      'select id, rating, comment from public.reviews where booking_id = $1 and customer_id = $2',
      [vehicleBookingId, customerId],
    )
    const otherReviews = await db.query(
      'select id from public.reviews where customer_id <> $1',
      [customerId],
    )
    await db.exec('reset role')
    assert.equal(ownReview.rows.length, 1)
    assert.equal(otherReviews.rows.length, 0, 'authenticated review lookup remains owner-scoped')

    // Exercise the existing invoker RPC, including its metadata column reads.
    await db.exec(`
      create table public.profiles (id uuid primary key, full_name text);
      insert into public.profiles values ('${customerId}', 'Test Customer');
      grant select on public.profiles to authenticated;
      update public.reviews set target_mechanic_id = '${mechanicId}' where id = '${serviceReviewId}';
    `)
    const adminMigration = await readFile(new URL('../supabase/migrations/20261011170000_mechanic_details.sql', import.meta.url), 'utf8')
    await db.exec(adminMigration.slice(adminMigration.indexOf('create function public.get_admin_mechanic_records')))
    await db.exec(`select set_config('request.jwt.claim.sub', '${adminId}', false); set role authenticated;`)
    const adminReviews = await db.query('select public.get_admin_mechanic_records($1, $2, 0) as records', [mechanicId, 'reviews'])
    assert.equal(adminReviews.rows[0].records.length, 1)
    assert.equal(adminReviews.rows[0].records[0].id, serviceReviewId)
    assert.ok(adminReviews.rows[0].records[0].created_at)
  } finally {
    await db.close()
  }
})
