-- Public sidebar testimonials expose only verified, non-empty review text
-- and the catalog item purchased. Customer and booking records stay private.

-- The client review editor reads only a customer's own review. Public readers
-- use the narrowly scoped RPC below instead of selecting from reviews.
drop policy if exists "reviews select" on public.reviews;
drop policy if exists "reviews select owner or admin" on public.reviews;

create policy "reviews select owner or admin"
  on public.reviews
  for select
  to authenticated
  using (customer_id = auth.uid() or public.is_admin());

revoke select on table public.reviews from public, anon, authenticated;
grant select (id, booking_type, booking_id, customer_id, rating, comment)
  on table public.reviews to authenticated;

create or replace function public.get_sidebar_testimonials()
returns table (
  review_id uuid,
  rating integer,
  comment text,
  acquired_label text,
  reviewer_label text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with verified_reviews as (
    select
      r.id as review_id,
      r.rating::integer as rating,
      r.comment,
      'Rental · ' || v.name as acquired_label,
      r.created_at
    from public.reviews as r
    join public.vehicle_bookings as vb
      on vb.id = r.booking_id
      and vb.customer_id = r.customer_id
      and vb.status = 'completed'
    join public.vehicles as v on v.id = vb.vehicle_id
    where r.booking_type = 'vehicle'
      and r.comment is not null
      and btrim(r.comment) <> ''

    union all

    select
      r.id as review_id,
      r.rating::integer as rating,
      r.comment,
      'Service · ' || string_agg(distinct ms.name, ', ' order by ms.name) as acquired_label,
      r.created_at
    from public.reviews as r
    join public.service_bookings as sb
      on sb.id = r.booking_id
      and sb.customer_id = r.customer_id
      and sb.status = 'completed'
    join public.service_booking_items as sbi on sbi.service_booking_id = sb.id
    join public.mechanic_services as ms on ms.id = sbi.mechanic_service_id
    where r.booking_type = 'service'
      and r.comment is not null
      and btrim(r.comment) <> ''
    group by r.id, r.rating, r.comment, r.created_at
  ), cleaned_reviews as (
    select
      review_id,
      rating,
      left(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  btrim(comment),
                  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
                  '[contact removed]', 'gi'
                ),
                '[-+]?[0-9]{1,3}\.[0-9]{3,}[[:space:]]*,[[:space:]]*[-+]?[0-9]{1,3}\.[0-9]{3,}',
                '[location removed]', 'g'
              ),
              '\m[0-9]{1,6}[[:space:]]+[[:alpha:]][[:alnum:]. -]{1,50}[[:space:]]+(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|highway|hwy\.?)\M',
              '[address removed]', 'gi'
            ),
            '(\+|00)?[0-9][0-9 ().-]{7,}[0-9]',
            '[contact removed]', 'g'
          ),
          '\m[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\M',
          '[reference removed]', 'gi'
        ),
        800
      ) as comment,
      acquired_label,
      created_at
    from verified_reviews
  )
  select
    review_id,
    rating,
    comment,
    acquired_label,
    'Verified customer'::text as reviewer_label
  from cleaned_reviews
  order by created_at desc, review_id
  limit 10;
$function$;

revoke all on function public.get_sidebar_testimonials() from public, anon, authenticated;
grant execute on function public.get_sidebar_testimonials() to anon, authenticated;
