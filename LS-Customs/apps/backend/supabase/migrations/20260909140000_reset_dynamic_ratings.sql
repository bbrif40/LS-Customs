-- Ratings are customer-generated. Remove seeded/test reviews and reset the
-- denormalized aggregates so the first customer review starts from zero.
delete from public.reviews;

update public.vehicles
set rating_avg = 0,
    rating_count = 0;

update public.mechanic_profiles
set rating_avg = 0,
    rating_count = 0;