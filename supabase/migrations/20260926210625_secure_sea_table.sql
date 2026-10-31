
-- =========================================================================
-- 1. Fix FK/NOT NULL inconsistency: ON DELETE SET NULL requires nullable cols
-- =========================================================================
alter table public.sea
  alter column created_by drop not null,
  alter column last_updated_by drop not null;

-- =========================================================================
-- 2. flag domain constraint: only 'red' or 'blue'
-- =========================================================================
alter table public.sea
  add constraint sea_flag_check check (flag in ('red', 'blue'));

-- =========================================================================
-- 3. Helper: is the current authenticated user active AND approved?
--    (role-agnostic — employee or admin both qualify)
-- =========================================================================
create or replace function public.is_active_approved()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.approved = true
  );
$$;

revoke all on function public.is_active_approved() from public;
grant execute on function public.is_active_approved() to authenticated;

-- =========================================================================
-- 4. Trigger function: server-controlled audit fields for insert/update
--    - When invoked with an authenticated JWT (auth.uid() is not null),
--      ALL audit fields are derived from the session/profile, never trusted
--      from the client payload.
--    - When invoked with no JWT context (service_role / SQL editor /
--      privileged dashboard access), admin-supplied values are respected,
--      only filling in timestamps if left blank.
-- =========================================================================
create or replace function public.sea_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_email text;
  v_name text;
begin
  if TG_OP = 'INSERT' then
    if auth.uid() is not null then
      select p.email, p.full_name into v_email, v_name
      from public.profiles p
      where p.id = auth.uid();

      NEW.id := coalesce(NEW.id, gen_random_uuid());
      NEW.created_at := now();
      NEW.updated_at := now();
      NEW.created_by := auth.uid();
      NEW.created_by_email_snapshot := coalesce(v_email, '');
      NEW.last_updated_by := auth.uid();
      NEW.last_updated_by_email_snapshot := coalesce(v_email, '');
      NEW.last_updated_by_name_snapshot := coalesce(v_name, v_email, '');
    else
      -- privileged/dashboard context: no JWT session to derive identity from
      NEW.created_at := coalesce(NEW.created_at, now());
      NEW.updated_at := coalesce(NEW.updated_at, now());
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if auth.uid() is not null then
      select p.email, p.full_name into v_email, v_name
      from public.profiles p
      where p.id = auth.uid();

      -- creation identity is immutable once set
      NEW.id := OLD.id;
      NEW.created_at := OLD.created_at;
      NEW.created_by := OLD.created_by;
      NEW.created_by_email_snapshot := OLD.created_by_email_snapshot;

      -- audit trail is always derived from the authenticated session
      NEW.updated_at := now();
      NEW.last_updated_by := auth.uid();
      NEW.last_updated_by_email_snapshot := coalesce(v_email, '');
      NEW.last_updated_by_name_snapshot := coalesce(v_name, v_email, '');
    else
      -- privileged context: still stamp updated_at, keep id/created_at immutable
      NEW.id := OLD.id;
      NEW.created_at := OLD.created_at;
      NEW.updated_at := now();
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists sea_before_insert on public.sea;
create trigger sea_before_insert
  before insert on public.sea
  for each row execute function public.sea_set_audit_fields();

drop trigger if exists sea_before_update on public.sea;
create trigger sea_before_update
  before update on public.sea
  for each row execute function public.sea_set_audit_fields();

-- =========================================================================
-- 5. RLS: ensure enabled, then (re)create precise policies
-- =========================================================================
alter table public.sea enable row level security;

drop policy if exists sea_select_all on public.sea;
drop policy if exists sea_update_active_approved on public.sea;

-- Public read, no auth required
create policy sea_select_all
  on public.sea
  for select
  to anon, authenticated
  using (true);

-- Only active + approved profiles may update (row-level gate;
-- column-level gate is enforced separately via GRANT below)
create policy sea_update_active_approved
  on public.sea
  for update
  to authenticated
  using ( public.is_active_approved() )
  with check ( public.is_active_approved() );

-- No INSERT policy and no DELETE policy for anon/authenticated:
-- absence of a permissive policy means those operations are denied by RLS
-- for those roles. Only privileged roles (postgres/service_role, which
-- bypass RLS / operate outside PostgREST) can insert or delete this row.

-- =========================================================================
-- 6. Grants: revoke the broad default privileges, grant back precisely
-- =========================================================================
revoke all on public.sea from anon, authenticated;

-- SELECT: full row readable by anyone (anon included)
grant select (
  id, created_at, updated_at, flag,
  created_by, created_by_email_snapshot,
  last_updated_by, last_updated_by_email_snapshot, last_updated_by_name_snapshot
) on public.sea to anon, authenticated;

-- UPDATE: only the flag column, only for authenticated users
-- (row-level eligibility is further gated by the RLS policy above)
grant update (flag) on public.sea to authenticated;

-- No INSERT, no DELETE grants to anon or authenticated.
