-- 1. is_admin(): single source of truth = is_active_approved_admin() (role admin AND approved AND is_active).
--    SECURITY DEFINER wrapper so it can be used inside profiles policies/trigger without RLS recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_approved_admin();
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- 2. Trigger: self-service edits are phone-only (full_name now protected as well). Everything else preserved.
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting_user     uuid;
  acting_is_admin boolean;
  acting_is_self  boolean;
begin
  -- Owner-level / trusted backend bypass (SQL editor, service_role): never reachable via anon/authenticated.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  acting_user     := auth.uid();
  acting_is_admin := public.is_admin();
  acting_is_self  := (acting_user = old.id);

  -- Immutable / server-controlled fields: never trust client-supplied values
  new.id         := old.id;
  new.email      := old.email;
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
    new.approved_by := old.approved_by;
    new.approved_by_email_snapshot := old.approved_by_email_snapshot;
  end if;

  if acting_is_self then
    -- own profile: phone is the ONLY client-editable field
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.approved is distinct from old.approved
       or new.job_title is distinct from old.job_title
       or new.full_name is distinct from old.full_name
    then
      raise exception 'You cannot modify privileged fields on your own profile.';
    end if;
  elsif acting_is_admin then
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

-- trigger functions never need to be callable by API roles
revoke all on function public.profiles_before_update() from public, anon, authenticated;
