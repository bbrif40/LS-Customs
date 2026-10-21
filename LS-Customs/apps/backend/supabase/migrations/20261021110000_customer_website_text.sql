-- Public website copy is stored as plain text. Clients can read the catalog,
-- while edits go through an admin-only optimistic-concurrency RPC.
create table public.website_text (
  key text primary key,
  section text not null,
  label text not null,
  default_text text not null,
  value text,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.website_text enable row level security;

create policy website_text_public_read
  on public.website_text
  for select
  to anon, authenticated
  using (true);

revoke all on public.website_text from public, anon, authenticated;
grant select on public.website_text to anon, authenticated;
grant all on public.website_text to service_role;

create or replace function public.save_website_text(p_changes jsonb)
returns setof public.website_text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  item jsonb;
  target_row public.website_text;
  requested_key text;
  requested_value text;
  requested_revision integer;
  seen_keys text[] := array[]::text[];
  expected_tokens text[];
  submitted_tokens text[];
  actor_id uuid;
  actor_name text;
  actor_email text;
begin
  actor_id := auth.uid();
  if actor_id is null or not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Changes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 3000 then
    raise exception 'A save may contain at most 3000 changes' using errcode = '22023';
  end if;

  -- Validate and lock every target before writing any row. Any invalid item
  -- rejects the whole batch, and row locks keep the revision check current.
  for item in select entries.value from jsonb_array_elements(p_changes) as entries(value)
  loop
    if jsonb_typeof(item) <> 'object'
       or not (item ? 'key' and item ? 'value' and item ? 'revision') then
      raise exception 'Each change must contain key, value, and revision' using errcode = '22023';
    end if;

    if jsonb_typeof(item->'key') <> 'string' or btrim(item->>'key') = '' then
      raise exception 'Each change must have a non-empty key' using errcode = '22023';
    end if;
    requested_key := item->>'key';
    if requested_key = any(seen_keys) then
      raise exception 'Duplicate website text key: %', requested_key using errcode = '22023';
    end if;
    seen_keys := array_append(seen_keys, requested_key);

    if jsonb_typeof(item->'revision') <> 'number'
       or (item->>'revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Revision for % must be a positive integer', requested_key using errcode = '22023';
    end if;
    begin
      requested_revision := (item->>'revision')::integer;
    exception when numeric_value_out_of_range or invalid_text_representation then
      raise exception 'Revision for % must be a positive integer', requested_key using errcode = '22023';
    end;

    if jsonb_typeof(item->'value') not in ('string', 'null') then
      raise exception 'Value for % must be text or null', requested_key using errcode = '22023';
    end if;
    requested_value := case when item->'value' = 'null'::jsonb then null else item->>'value' end;
    if requested_value is not null and char_length(requested_value) not between 1 and 4000 then
      raise exception 'Value for % must contain between 1 and 4000 characters', requested_key using errcode = '22023';
    end if;

    select text_row.* into target_row
      from public.website_text as text_row
     where text_row.key = requested_key
     for update;
    if not found then
      raise exception 'Unknown website text key: %', requested_key using errcode = '22023';
    end if;
    if requested_revision <> target_row.revision then
      raise exception 'Revision conflict for %: expected %, received %',
        requested_key, target_row.revision, requested_revision using errcode = '40001';
    end if;

    select coalesce(array_agg(match[1] order by match[1]), array[]::text[])
      into expected_tokens
      from regexp_matches(target_row.default_text, '\{[^{}]+\}', 'g') as match;
    if requested_value is not null then
      select coalesce(array_agg(match[1] order by match[1]), array[]::text[])
        into submitted_tokens
        from regexp_matches(requested_value, '\{[^{}]+\}', 'g') as match;
      if submitted_tokens is distinct from expected_tokens then
        raise exception 'Placeholder tokens must be preserved for %', requested_key using errcode = '22023';
      end if;
    end if;
  end loop;

  select coalesce(profile.full_name, 'Admin'), coalesce(user_row.email, '')
    into actor_name, actor_email
    from public.profiles as profile
    left join auth.users as user_row on user_row.id = profile.id
   where profile.id = actor_id;
  actor_name := coalesce(nullif(actor_name, ''), 'Admin');
  actor_email := coalesce(actor_email, '');

  for item in select entries.value from jsonb_array_elements(p_changes) as entries(value)
  loop
    requested_key := item->>'key';
    requested_value := case when item->'value' = 'null'::jsonb then null else item->>'value' end;

    select text_row.* into target_row
      from public.website_text as text_row
     where text_row.key = requested_key;

    if target_row.value is distinct from requested_value then
      insert into public.admin_audit_logs (
        admin_id, admin_name, admin_email, action_type, record_type,
        record_id, record_title, details, created_at
      ) values (
        actor_id,
        actor_name,
        actor_email,
        'website_text_changed',
        'website_text',
        target_row.key,
        target_row.label,
        jsonb_build_object(
          'before_text', coalesce(target_row.value, target_row.default_text),
          'after_text', coalesce(requested_value, target_row.default_text),
          'before_value', target_row.value,
          'after_value', requested_value
        ),
        clock_timestamp()
      );

      update public.website_text as text_row
         set value = requested_value,
             revision = text_row.revision + 1,
             updated_at = clock_timestamp(),
             updated_by = actor_id
       where text_row.key = requested_key
      returning text_row.* into target_row;

      return next target_row;
    end if;
  end loop;

  return;
end;
$function$;

revoke all on function public.save_website_text(jsonb) from public, anon, service_role;
grant execute on function public.save_website_text(jsonb) to authenticated;

-- Realtime is optional in local/test databases and may not be installed.
do $publication$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'website_text'
     ) then
    execute 'alter publication supabase_realtime add table public.website_text';
  end if;
end;
$publication$;
