-- 1) Authorization helper (SECURITY INVOKER: reads only the caller's own profiles row)
create or replace function public.is_active_approved_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.user_role
      and p.approved = true
      and p.is_active = true
  );
$$;
revoke all on function public.is_active_approved_admin() from public, anon;
grant execute on function public.is_active_approved_admin() to authenticated;

-- 2) Audit trigger function (DB-controlled audit fields; client values never trusted)
create or replace function public.hotel_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
    if not found then
      raise exception 'Authenticated user % not found; cannot stamp audit fields', v_uid
        using errcode = '28000';
    end if;
    v_email := coalesce(v_email, '');
  end if;

  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_at := now();
      new.updated_at := now();
      new.created_by := v_uid;
      new.created_by_email_snapshot := v_email;
      new.last_updated_by := v_uid;
      new.last_updated_by_email_snapshot := v_email;
    else
      -- system / privileged insert with no authenticated user: never invent one
      new.created_at := coalesce(new.created_at, now());
      new.updated_at := now();
      new.created_by := null;
      new.created_by_email_snapshot := '';
      new.last_updated_by := null;
      new.last_updated_by_email_snapshot := '';
    end if;
    return new;
  end if;

  -- UPDATE: creation identity and id are immutable
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.created_by_email_snapshot := old.created_by_email_snapshot;
  new.updated_at := now();

  if v_uid is not null then
    new.last_updated_by := v_uid;
    new.last_updated_by_email_snapshot := v_email;
  else
    -- system / privileged update with no authenticated user: keep prior attribution
    new.last_updated_by := old.last_updated_by;
    new.last_updated_by_email_snapshot := old.last_updated_by_email_snapshot;
  end if;
  return new;
end;
$fn$;
revoke all on function public.hotel_set_audit_fields() from public, anon, authenticated;

drop trigger if exists hotel_set_audit_fields_trg on public.hotel;
create trigger hotel_set_audit_fields_trg
  before insert or update on public.hotel
  for each row execute function public.hotel_set_audit_fields();

-- 3) RLS stays on; existing "Anyone can read" SELECT policy is kept as-is
alter table public.hotel enable row level security;

-- 4) UPDATE policy for active + approved admins only. No INSERT / DELETE policies.
drop policy if exists "hotel_update_active_approved_admin" on public.hotel;
create policy "hotel_update_active_approved_admin" on public.hotel
  for update to authenticated
  using (public.is_active_approved_admin())
  with check (public.is_active_approved_admin());

-- 5) Grants: reset, then allow-list
revoke all on table public.hotel from anon, authenticated;

grant select (id, created_at, name, beach_access_methods, menu_link, updated_at, aquapark, dining)
  on public.hotel to anon, authenticated;

grant update (name, beach_access_methods, menu_link, aquapark, dining)
  on public.hotel to authenticated;

-- 6) Admin full-data view (owner-privileged on purpose; gated by the helper)
create or replace view public.hotel_admin
  with (security_invoker = false, security_barrier = true) as
select h.id, h.created_at, h.name, h.beach_access_methods, h.menu_link,
       h.updated_at, h.aquapark, h.dining,
       h.last_updated_by, h.created_by,
       h.last_updated_by_email_snapshot, h.created_by_email_snapshot
from public.hotel h
where public.is_active_approved_admin();

revoke all on public.hotel_admin from public, anon, authenticated;
grant select on public.hotel_admin to authenticated;
