
create or replace function public.profiles_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  acting_user uuid;
  acting_is_admin boolean;
  acting_is_self boolean;
begin
  -- The database owner (Supabase SQL editor / postgres) and service_role
  -- (trusted backend usage) bypass all of the checks below. This is the
  -- "owner-level access" escape hatch for privileged changes (self-promotion
  -- fixes, restoring an admin, etc.) that must never be reachable through
  -- the normal authenticated/anon API roles.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  acting_user := auth.uid();
  acting_is_admin := public.is_admin();
  acting_is_self := (acting_user = old.id);

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
    new.approved_by := old.approved_by;
    new.approved_by_email_snapshot := old.approved_by_email_snapshot;
  end if;

  if acting_is_self then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.approved is distinct from old.approved
       or new.job_title is distinct from old.job_title
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
