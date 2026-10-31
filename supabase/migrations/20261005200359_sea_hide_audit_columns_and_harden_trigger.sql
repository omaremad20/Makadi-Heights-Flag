-- 1. Trigger function: audit fields come only from the DB session; never from NEW.*
create or replace function public.sea_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
begin
  if v_uid is not null then
    -- trusted email source: auth.users (not client-editable profile data)
    select u.email into v_email from auth.users u where u.id = v_uid;
    if not found then
      raise exception 'Authenticated user % not found; cannot stamp audit fields', v_uid
        using errcode = '28000';
    end if;
    v_email := coalesce(v_email, '');
    select p.full_name into v_name from public.profiles p where p.id = v_uid;
    v_name := coalesce(nullif(v_name, ''), nullif(v_email, ''), '');
  end if;

  if tg_op = 'INSERT' then
    new.id         := coalesce(new.id, gen_random_uuid());
    new.created_at := now();
    new.updated_at := now();
    if v_uid is not null then
      new.created_by                     := v_uid;
      new.created_by_email_snapshot      := v_email;
      new.last_updated_by                := v_uid;
      new.last_updated_by_email_snapshot := v_email;
      new.last_updated_by_name_snapshot  := v_name;
    else
      -- privileged insert with no session user: never invent or trust an identity
      new.created_by                     := null;
      new.created_by_email_snapshot      := '';
      new.last_updated_by                := null;
      new.last_updated_by_email_snapshot := '';
      new.last_updated_by_name_snapshot  := '';
    end if;
    return new;
  end if;

  -- UPDATE: identity and creation audit are immutable
  new.id                        := old.id;
  new.created_at                := old.created_at;
  new.created_by                := old.created_by;
  new.created_by_email_snapshot := old.created_by_email_snapshot;
  new.updated_at                := now();
  if v_uid is not null then
    new.last_updated_by                := v_uid;
    new.last_updated_by_email_snapshot := v_email;
    new.last_updated_by_name_snapshot  := v_name;
  else
    -- privileged update with no session user: keep prior attribution
    new.last_updated_by                := old.last_updated_by;
    new.last_updated_by_email_snapshot := old.last_updated_by_email_snapshot;
    new.last_updated_by_name_snapshot  := old.last_updated_by_name_snapshot;
  end if;
  return new;
end;
$$;

-- trigger functions never need to be callable by API roles
revoke all on function public.sea_set_audit_fields() from public, anon, authenticated;

-- 2. Column-level privileges: clients may read only id + flag
revoke select on public.sea from anon, authenticated;
revoke select (created_at, updated_at, created_by, last_updated_by,
               created_by_email_snapshot, last_updated_by_email_snapshot,
               last_updated_by_name_snapshot)
  on public.sea from anon, authenticated;
grant select (id, flag) on public.sea to anon, authenticated;
-- UPDATE stays: authenticated may update only (flag); RLS policies unchanged.
