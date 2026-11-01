
-- ============================================================
-- 1. ROLE ENUM
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('employee', 'admin');
  end if;
end $$;

-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,

  role public.user_role not null default 'employee',
  is_active boolean not null default true,

  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_email_snapshot text,

  job_title text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  last_updated_by uuid references public.profiles(id) on delete set null,
  last_updated_by_email_snapshot text
);

comment on table public.profiles is
  'Application profile 1:1 with auth.users. Populated automatically on Google OAuth signup. Authentication identity (email) is owned by auth.users; profiles.email is a server-controlled snapshot.';
comment on column public.profiles.approved_by is
  'Preserved historically even after un-approval or after the approving admin is deleted (ON DELETE SET NULL).';

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_is_active on public.profiles(is_active);
create index if not exists idx_profiles_approved on public.profiles(approved);

-- ============================================================
-- 3. HELPER: is_admin() — SECURITY DEFINER to avoid recursive RLS
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.user_role
      and p.is_active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- 4. AUTO-CREATE PROFILE ON NEW auth.users ROW (Google OAuth signup)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- 5. PROTECTIVE BEFORE-UPDATE TRIGGER (field-level enforcement)
-- ============================================================
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_is_admin boolean := public.is_admin();
  acting_is_self boolean := (acting_user = old.id);
begin
  -- Immutable / server-controlled fields: never trust client-supplied values
  new.id := old.id;
  new.email := old.email;
  new.avatar_url := old.avatar_url;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.last_updated_by := acting_user;
  new.last_updated_by_email_snapshot := auth.email();

  -- Approval audit trail, derived server-side only
  if (new.approved is distinct from old.approved) and new.approved = true then
    new.approved_by := acting_user;
    new.approved_by_email_snapshot := auth.email();
  else
    -- unchanged, or being un-approved: preserve prior approval history
    new.approved_by := old.approved_by;
    new.approved_by_email_snapshot := old.approved_by_email_snapshot;
  end if;

  if acting_is_self then
    -- Self-update (employee or admin): only full_name/phone may change
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.approved is distinct from old.approved
       or new.job_title is distinct from old.job_title
    then
      raise exception 'You cannot modify privileged fields on your own profile.';
    end if;
  elsif acting_is_admin then
    -- Admin acting on someone else's row. RLS already restricts the target
    -- to employee rows, but re-check here as defense in depth.
    if old.role is distinct from 'employee'::public.user_role then
      raise exception 'Admins cannot modify other admin profiles.';
    end if;
    if new.role is distinct from old.role and new.role is distinct from 'admin'::public.user_role then
      raise exception 'Invalid role transition.';
    end if;
  else
    raise exception 'Not authorized to update this profile.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_before_update_trigger on public.profiles;
create trigger profiles_before_update_trigger
  before update on public.profiles
  for each row
  execute function public.profiles_before_update();

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (public.is_admin() and role = 'employee'::public.user_role)
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id
    or (public.is_admin() and role = 'employee'::public.user_role)
  )
  with check (
    auth.uid() = id
    or (public.is_admin() and id <> auth.uid())
  );

-- No insert policy: profiles can only be created by the handle_new_user()
-- trigger (SECURITY DEFINER, bypasses RLS) or by the project owner/service_role.
-- No delete policy: only the database owner/service_role can delete profiles
-- (normally via deleting the auth.users row, which cascades).

-- ============================================================
-- 7. LOCK DOWN GRANTS (this project's default privileges grant ALL on
--    new public tables to anon/authenticated — must be explicitly revoked)
-- ============================================================
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, role, is_active, approved, job_title) on public.profiles to authenticated;
-- Deliberately NOT granted to authenticated: insert, delete, and update on
-- id, email, avatar_url, created_at, updated_at, approved_by,
-- approved_by_email_snapshot, last_updated_by, last_updated_by_email_snapshot.
-- anon gets no privileges on this table at all.
