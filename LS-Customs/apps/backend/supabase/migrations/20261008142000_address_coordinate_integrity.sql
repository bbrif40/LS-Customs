-- Text-only saved addresses are not confirmed geographic points.
alter table public.addresses alter column lat drop not null;
alter table public.addresses alter column lng drop not null;
update public.addresses set lat=null,lng=null where lat=0 and lng=0;
alter table public.addresses add constraint addresses_coordinates_paired
  check ((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180 and lat is not null and lng is not null));
