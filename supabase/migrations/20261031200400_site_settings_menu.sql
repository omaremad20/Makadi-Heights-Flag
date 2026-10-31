-- =============================================================================
-- Stage 4 — site_settings: the only dynamic value left from `hotel` is which
-- PDF in the `menu` bucket is the current menu. Everything else (dining,
-- aquapark, beach access) moves to static frontend config.
--
-- NON-DESTRUCTIVE. public.hotel is dropped later in a separate migration
-- (supabase/pending/…_drop_hotel.sql) once nothing reads it.
-- =============================================================================

create table if not exists public.site_settings (
  key                            text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value                          jsonb not null,
  is_public                      boolean not null default false,
  updated_at                     timestamptz not null default now(),
  updated_by                     uuid references public.profiles(id) on delete set null,
  updated_by_email_snapshot      text
);

comment on table public.site_settings is
  'Small key/value store for genuinely dynamic site settings. Rows with is_public = true are readable by anyone: never store secrets or admin data there.';

-- The menu value must point inside the `menu` bucket.
alter table public.site_settings drop constraint if exists site_settings_menu_shape_chk;
alter table public.site_settings add constraint site_settings_menu_shape_chk check (
  key <> 'menu' or (
    jsonb_typeof(value) = 'object'
    and value ->> 'bucket' = 'menu'
    and coalesce(value ->> 'path', '') ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.pdf$'
  )
);

-- Seed from the live hotel row so the current menu keeps working, whatever it
-- is at the moment this runs.
insert into public.site_settings (key, value, is_public)
select 'menu',
       jsonb_build_object('bucket', 'menu',
         'path', regexp_replace(h.menu_link, '^.*/storage/v1/object/public/menu/', '')),
       true
from public.hotel h
where h.menu_link ~ '/storage/v1/object/public/menu/[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.pdf$'
order by h.updated_at desc
limit 1
on conflict (key) do nothing;

-- Audit stamping (client values never trusted)
create or replace function public.site_settings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if tg_op = 'UPDATE' then
    new.key := old.key;
    new.is_public := old.is_public;
  end if;
  new.updated_at := now();
  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
    new.updated_by := v_uid;
    new.updated_by_email_snapshot := coalesce(v_email, '');
  elsif tg_op = 'UPDATE' then
    new.updated_by := old.updated_by;
    new.updated_by_email_snapshot := old.updated_by_email_snapshot;
  end if;
  return new;
end;
$$;
revoke all on function public.site_settings_before_write() from public, anon, authenticated;

drop trigger if exists site_settings_before_write_trg on public.site_settings;
create trigger site_settings_before_write_trg
  before insert or update on public.site_settings
  for each row execute function public.site_settings_before_write();

alter table public.site_settings enable row level security;
revoke all on public.site_settings from public, anon, authenticated;
-- Column-scoped: the audit columns (who changed it) are never exposed through
-- the API, not even for public rows.
grant select (key, value, is_public, updated_at) on public.site_settings to anon, authenticated;
grant update (value) on public.site_settings to authenticated;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  as permissive for select to anon, authenticated
  using (is_public or (select public.is_active_approved_admin()));

drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings
  as permissive for update to authenticated
  using ((select public.is_active_approved_admin()))
  with check ((select public.is_active_approved_admin()));
