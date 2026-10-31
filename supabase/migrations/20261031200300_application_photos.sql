-- =============================================================================
-- Stage 3 — applicant photos (one optional photo per person)
--
-- Storage: private bucket `application-photos`. No anon/authenticated policy
-- allows public access. Guests upload ONLY through short-lived signed upload
-- URLs that the server issues for paths reserved here. No UPDATE policy exists
-- for anyone, so an object can never be overwritten; a replacement is always
-- a new object.
--
-- Path:   {application_id}/{person_key}/{photo_id}.{webp|jpg}
--         person_key = 'applicant' | 'partner' | <additional person id>
--
-- Lifecycle of a row in public.application_photos:
--   reserved  -> slot issued, waiting for the upload (expires after 24 h)
--   active    -> the photo currently shown for that person
--   replaced  -> superseded by a newer photo; object deleted 30 days later
--   expired   -> reservation never used; no object exists
--   deleted   -> object removed by the cleanup job (row kept as a record)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-photos', 'application-photos', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table if not exists public.application_photos (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete restrict,
  person_key      text not null,
  storage_path    text not null unique,
  status          text not null default 'reserved',
  reserved_by     text not null default 'applicant',  -- 'applicant' | 'admin'
  created_at      timestamptz not null default now(),
  uploaded_at     timestamptz,
  replaced_at     timestamptz,
  replaced_by     uuid references public.profiles(id) on delete set null,
  deleted_at      timestamptz,
  delete_reason   text,
  constraint application_photos_status_chk
    check (status in ('reserved', 'active', 'replaced', 'expired', 'deleted')),
  constraint application_photos_reserved_by_chk
    check (reserved_by in ('applicant', 'admin')),
  constraint application_photos_person_key_chk
    check (person_key in ('applicant', 'partner') or public.app_is_uuid_text(person_key)),
  constraint application_photos_path_chk
    check (storage_path ~ '^[0-9a-f-]{36}/[a-z0-9-]{7,36}/[0-9a-f-]{36}\.(webp|jpg)$'
           and split_part(storage_path, '/', 1) = application_id::text
           and split_part(storage_path, '/', 2) = person_key)
);

comment on table public.application_photos is
  'One row per photo object in the private application-photos bucket. Written only by SECURITY DEFINER functions.';

create unique index if not exists application_photos_one_active_per_person
  on public.application_photos (application_id, person_key) where status = 'active';
create index if not exists application_photos_application_idx
  on public.application_photos (application_id);
create index if not exists application_photos_status_created_idx
  on public.application_photos (status, created_at);

alter table public.application_photos enable row level security;
revoke all on public.application_photos from public, anon, authenticated;
grant select on public.application_photos to authenticated;

drop policy if exists application_photos_admin_select on public.application_photos;
create policy application_photos_admin_select on public.application_photos
  as permissive for select to authenticated
  using ((select public.is_active_approved_admin()));

-- ---------------------------------------------------------------------------
-- 3. Storage policies for the private bucket (admins only; no UPDATE at all)
-- ---------------------------------------------------------------------------
drop policy if exists application_photos_admin_read on storage.objects;
create policy application_photos_admin_read on storage.objects
  as permissive for select to authenticated
  using (bucket_id = 'application-photos' and (select public.is_active_approved_admin()));

-- Admin uploads (photo replacement) are allowed only into a path that the
-- database reserved for an admin replacement.
drop policy if exists application_photos_admin_insert on storage.objects;
create policy application_photos_admin_insert on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'application-photos'
    and (select public.is_active_approved_admin())
    and exists (
      select 1 from public.application_photos p
      where p.storage_path = name and p.status = 'reserved' and p.reserved_by = 'admin'
    )
  );

drop policy if exists application_photos_admin_delete on storage.objects;
create policy application_photos_admin_delete on storage.objects
  as permissive for delete to authenticated
  using (bucket_id = 'application-photos' and (select public.is_active_approved_admin()));

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
-- Valid person keys for an application, in form order.
create or replace function public.app_person_keys(p_application_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array['applicant']
         || case when a.partner_name is not null then array['partner'] else '{}'::text[] end
         || coalesce((select array_agg(e ->> 'id' order by ord)
                      from jsonb_array_elements(coalesce(a.additional_persons, '[]'::jsonb))
                           with ordinality as t(e, ord)), '{}'::text[])
  from public.applications a
  where a.id = p_application_id
$$;
revoke all on function public.app_person_keys(uuid) from public, anon, authenticated;
grant execute on function public.app_person_keys(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Guest flow (service role only — called from the Next.js server route)
-- ---------------------------------------------------------------------------
-- The idempotency key the browser generated for its submission is the
-- capability: only the submitter knows it. Reservations are allowed while the
-- application is pending and less than 24 h old.
create or replace function public.reserve_application_photos(
  p_idempotency_key uuid,
  p_person_keys     text[],
  p_extension       text default 'webp')
returns table (person_key text, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app   public.applications;
  v_valid text[];
  v_key   text;
  v_open  int;
begin
  if p_extension not in ('webp', 'jpg') then
    raise exception 'invalid_extension' using errcode = 'PT422';
  end if;
  if p_person_keys is null or cardinality(p_person_keys) = 0 or cardinality(p_person_keys) > 22 then
    raise exception 'invalid_person_keys' using errcode = 'PT422';
  end if;

  select * into v_app from public.applications a where a.idempotency_key = p_idempotency_key;
  if not found then
    raise exception 'application_not_found' using errcode = 'PT404';
  end if;
  if v_app.status <> 'pending' or v_app.created_at < now() - interval '24 hours' then
    raise exception 'upload_window_closed' using errcode = 'PT409';
  end if;

  v_valid := public.app_person_keys(v_app.id);

  foreach v_key in array p_person_keys loop
    if not (v_key = any (v_valid)) then
      raise exception 'unknown_person' using errcode = 'PT422', detail = v_key;
    end if;

    -- abuse guard: at most 5 open reservations per person
    select count(*) into v_open from public.application_photos p
     where p.application_id = v_app.id and p.person_key = v_key and p.status = 'reserved';
    if v_open >= 5 then
      raise exception 'too_many_attempts' using errcode = 'PT429', detail = v_key;
    end if;

    return query
      insert into public.application_photos as p (application_id, person_key, storage_path, reserved_by)
      values (v_app.id, v_key,
              v_app.id::text || '/' || v_key || '/' || gen_random_uuid()::text || '.' || p_extension,
              'applicant')
      returning p.person_key, p.storage_path;
  end loop;
end;
$$;
revoke all on function public.reserve_application_photos(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.reserve_application_photos(uuid, text[], text) to service_role;

-- Serializes every "which photo is current for this person" decision, so
-- concurrent guest/admin/cleanup actions can never race each other.
create or replace function public.app_lock_person_photo(p_application_id uuid, p_person_key text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('application_photo:' || p_application_id::text || ':' || p_person_key, 0))
$$;
revoke all on function public.app_lock_person_photo(uuid, text) from public, anon, authenticated;

-- Confirms guest uploads once the object really exists in storage.
-- Precedence for the current photo of a person:
--   * an admin-placed photo is never displaced by a guest upload;
--   * otherwise the most recently RESERVED upload wins, so a slow, older
--     upload finishing late cannot displace a newer one.
-- result: confirmed | superseded | already_confirmed | not_uploaded | not_found
create or replace function public.confirm_application_photos(
  p_idempotency_key uuid,
  p_paths           text[])
returns table (person_key text, storage_path text, result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app     public.applications;
  v_path    text;
  v_row     public.application_photos;
  v_current public.application_photos;
begin
  select * into v_app from public.applications a where a.idempotency_key = p_idempotency_key;
  if not found then
    raise exception 'application_not_found' using errcode = 'PT404';
  end if;
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 22 then
    raise exception 'invalid_paths' using errcode = 'PT422';
  end if;

  foreach v_path in array p_paths loop
    v_row := null;
    storage_path := v_path;

    select * into v_row from public.application_photos p
     where p.storage_path = v_path and p.application_id = v_app.id and p.reserved_by = 'applicant';
    if not found then
      person_key := null; result := 'not_found';
      return next; continue;
    end if;

    perform public.app_lock_person_photo(v_app.id, v_row.person_key);
    select * into v_row from public.application_photos p where p.id = v_row.id;   -- re-read under the lock
    person_key := v_row.person_key;

    if v_row.status <> 'reserved' then
      result := case when v_row.status in ('active', 'replaced') then 'already_confirmed' else 'not_found' end;
      return next; continue;
    end if;
    if not exists (select 1 from storage.objects o
                   where o.bucket_id = 'application-photos' and o.name = v_path) then
      result := 'not_uploaded';
      return next; continue;
    end if;

    v_current := null;
    select * into v_current from public.application_photos p
     where p.application_id = v_app.id and p.person_key = v_row.person_key and p.status = 'active';

    if v_current.id is not null
       and (v_current.reserved_by = 'admin' or v_current.created_at > v_row.created_at) then
      update public.application_photos
         set status = 'replaced', uploaded_at = now(), replaced_at = now()
       where id = v_row.id;
      result := 'superseded';
    else
      update public.application_photos
         set status = 'replaced', replaced_at = now()
       where id = v_current.id;
      update public.application_photos
         set status = 'active', uploaded_at = now()
       where id = v_row.id;
      result := 'confirmed';
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.confirm_application_photos(uuid, text[]) from public, anon, authenticated;
grant execute on function public.confirm_application_photos(uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Admin replacement (runs as the signed-in admin; authorization checked here)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reserve_photo_replacement(
  p_application_id uuid,
  p_person_key     text,
  p_extension      text default 'webp')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not public.is_active_approved_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_extension not in ('webp', 'jpg') then
    raise exception 'invalid_extension' using errcode = 'PT422';
  end if;
  if not (p_person_key = any (coalesce(public.app_person_keys(p_application_id), '{}'))) then
    raise exception 'unknown_person' using errcode = 'PT422';
  end if;

  v_path := p_application_id::text || '/' || p_person_key || '/' || gen_random_uuid()::text || '.' || p_extension;
  insert into public.application_photos (application_id, person_key, storage_path, reserved_by)
  values (p_application_id, p_person_key, v_path, 'admin');
  return v_path;
end;
$$;
revoke all on function public.admin_reserve_photo_replacement(uuid, text, text) from public, anon;
grant execute on function public.admin_reserve_photo_replacement(uuid, text, text) to authenticated;

create or replace function public.admin_confirm_photo_replacement(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.application_photos;
  v_old   text;
begin
  if not public.is_active_approved_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.application_photos p
   where p.storage_path = p_storage_path and p.reserved_by = 'admin';
  if not found then
    raise exception 'reservation_not_found' using errcode = 'PT404';
  end if;
  perform public.app_lock_person_photo(v_row.application_id, v_row.person_key);
  select * into v_row from public.application_photos p where p.id = v_row.id;  -- re-read under the lock
  if v_row.status <> 'reserved' then
    raise exception 'reservation_already_used' using errcode = 'PT409';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'application-photos' and o.name = p_storage_path) then
    raise exception 'object_missing' using errcode = 'PT409';
  end if;

  update public.application_photos p
     set status = 'replaced', replaced_at = now(), replaced_by = v_uid
   where p.application_id = v_row.application_id and p.person_key = v_row.person_key and p.status = 'active'
  returning p.storage_path into v_old;

  update public.application_photos p
     set status = 'active', uploaded_at = now()
   where p.id = v_row.id;

  select u.email into v_email from auth.users u where u.id = v_uid;
  insert into public.application_revisions (
    application_id, changed_by, changed_by_email_snapshot, changed_fields, old_values, new_values)
  values (
    v_row.application_id, v_uid, v_email,
    array['photo:' || v_row.person_key],
    jsonb_build_object('photo:' || v_row.person_key, v_old),
    jsonb_build_object('photo:' || v_row.person_key, p_storage_path));
end;
$$;
revoke all on function public.admin_confirm_photo_replacement(text) from public, anon;
grant execute on function public.admin_confirm_photo_replacement(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cleanup support (used by the scheduled job; scheduling is a later stage)
-- ---------------------------------------------------------------------------
create table if not exists public.photo_cleanup_runs (
  id           bigint generated always as identity primary key,
  run_date     date not null,          -- Cairo calendar date; one scheduled run per day
  trigger_kind text not null default 'scheduled' check (trigger_kind in ('scheduled', 'manual')),
  dry_run      boolean not null default true,
  status       text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  candidates   int not null default 0,
  deleted      int not null default 0,
  expired      int not null default 0,
  failed       int not null default 0,
  error        text,
  details      jsonb
);
create unique index if not exists photo_cleanup_runs_one_scheduled_per_day
  on public.photo_cleanup_runs (run_date) where trigger_kind = 'scheduled';

alter table public.photo_cleanup_runs enable row level security;
revoke all on public.photo_cleanup_runs from public, anon, authenticated;
grant select on public.photo_cleanup_runs to authenticated;
drop policy if exists photo_cleanup_runs_admin_select on public.photo_cleanup_runs;
create policy photo_cleanup_runs_admin_select on public.photo_cleanup_runs
  as permissive for select to authenticated
  using ((select public.is_active_approved_admin()));

-- Returns NULL when today's scheduled run already exists (duplicate protection).
create or replace function public.start_photo_cleanup_run(
  p_dry_run boolean,
  p_trigger_kind text default 'scheduled')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.photo_cleanup_runs (run_date, trigger_kind, dry_run)
  values ((now() at time zone 'Africa/Cairo')::date, p_trigger_kind, p_dry_run)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.start_photo_cleanup_run(boolean, text) from public, anon, authenticated;
grant execute on function public.start_photo_cleanup_run(boolean, text) to service_role;

-- Closes a run with its totals. Status is derived: failed items -> 'partial'
-- (or 'failed' when nothing succeeded), otherwise 'succeeded'.
create or replace function public.finish_photo_cleanup_run(
  p_run_id     bigint,
  p_candidates int,
  p_deleted    int,
  p_expired    int,
  p_failed     int,
  p_error      text default null,
  p_details    jsonb default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  v_status := case
    when p_error is not null and coalesce(p_deleted, 0) + coalesce(p_expired, 0) = 0 then 'failed'
    when p_error is not null or coalesce(p_failed, 0) > 0 then 'partial'
    else 'succeeded'
  end;
  update public.photo_cleanup_runs
     set status = v_status, finished_at = now(),
         candidates = coalesce(p_candidates, 0), deleted = coalesce(p_deleted, 0),
         expired = coalesce(p_expired, 0), failed = coalesce(p_failed, 0),
         error = left(p_error, 2000), details = p_details
   where id = p_run_id and status = 'running';
  if not found then
    raise exception 'run_not_running' using errcode = 'PT409';
  end if;
  return v_status;
end;
$$;
revoke all on function public.finish_photo_cleanup_run(bigint, int, int, int, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_photo_cleanup_run(bigint, int, int, int, int, text, jsonb) to service_role;

-- Retention policy (approved by Omar 2026-10-31). The single source of truth
-- is photo_delete_reason(): it returns why a photo's object may be deleted
-- now, or NULL when it must be kept.
--   * current photo, pending application ......... kept
--   * current photo, approved application ........ kept (no expiry data yet)
--   * any photo, rejected / cancelled application  deleted 30 days after the status change
--   * replaced (superseded) photo ................. deleted 30 days after replacement
--   * reservation never uploaded .................. marked expired after 24 h (no storage call)
-- Rows are never deleted: a deleted photo keeps its metadata and history.
-- Only objects in the 'application-photos' bucket are ever referenced.
create or replace function public.photo_delete_reason(p_photo_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.status in ('rejected', 'cancelled')
         and a.status_updated_at < now() - interval '30 days'
      then 'application_' || a.status || '_30d'
    when p.status = 'replaced'
         and p.replaced_at < now() - interval '30 days'
      then 'replaced_30d'
  end
  from public.application_photos p
  join public.applications a on a.id = p.application_id
  where p.id = p_photo_id
    and p.status in ('active', 'replaced')
    and p.storage_path like a.id::text || '/%'
$$;
revoke all on function public.photo_delete_reason(uuid) from public, anon, authenticated;
grant execute on function public.photo_delete_reason(uuid) to service_role;

create or replace function public.photo_cleanup_candidates(p_limit int default 500)
returns table (photo_id uuid, storage_path text, action text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select p.id, p.storage_path, 'expire'::text, 'reservation_unused_24h'::text
    from public.application_photos p
    where p.status = 'reserved'
      and p.created_at < now() - interval '24 hours'
    union all
    select p.id, p.storage_path, 'delete'::text, r.reason
    from public.application_photos p
    cross join lateral (select public.photo_delete_reason(p.id) as reason) r
    where p.status in ('active', 'replaced')
      and r.reason is not null
  ) c
  limit greatest(1, least(p_limit, 1000))
$$;
revoke all on function public.photo_cleanup_candidates(int) from public, anon, authenticated;
grant execute on function public.photo_cleanup_candidates(int) to service_role;

-- Called by the job immediately BEFORE it deletes an object, so a status
-- change after the candidate list was built (e.g. a rejected application
-- re-opened) is respected.
create or replace function public.photo_cleanup_still_eligible(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.photo_delete_reason(p_photo_id) is not null
$$;
revoke all on function public.photo_cleanup_still_eligible(uuid) from public, anon, authenticated;
grant execute on function public.photo_cleanup_still_eligible(uuid) to service_role;

-- Records the outcome for one photo after the job talked to the Storage API.
create or replace function public.finish_photo_cleanup_item(
  p_photo_id uuid,
  p_action   text,
  p_object_existed boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo  public.application_photos;
  v_reason text;
begin
  select * into v_photo from public.application_photos where id = p_photo_id;
  if not found then return 'missing'; end if;
  perform public.app_lock_person_photo(v_photo.application_id, v_photo.person_key);
  select * into v_photo from public.application_photos where id = p_photo_id;  -- re-read under the lock

  if p_action = 'expire' then
    if v_photo.status <> 'reserved' then return 'skipped'; end if;
    if not p_object_existed then
      update public.application_photos set status = 'expired' where id = p_photo_id;
      return 'expired';
    end if;
    -- Uploaded but never confirmed. Become the current photo only if the
    -- person has none; never displace a newer current photo (e.g. an admin's).
    if exists (select 1 from public.application_photos p
               where p.application_id = v_photo.application_id
                 and p.person_key = v_photo.person_key and p.status = 'active') then
      update public.application_photos
         set status = 'replaced', uploaded_at = now(), replaced_at = now()
       where id = p_photo_id;
      return 'superseded';
    end if;
    update public.application_photos set status = 'active', uploaded_at = now() where id = p_photo_id;
    return 'activated';

  elsif p_action = 'delete' then
    -- The job calls this only AFTER photo_cleanup_still_eligible() returned
    -- true and the Storage API removed the object, so the row must reflect
    -- that the object is gone even if the status changed in the meantime.
    if v_photo.status not in ('active', 'replaced') then return 'skipped'; end if;
    v_reason := coalesce(public.photo_delete_reason(p_photo_id), 'eligible_at_delete_time');
    update public.application_photos
       set status = 'deleted', deleted_at = now(), delete_reason = v_reason
     where id = p_photo_id;
    return 'deleted';
  end if;
  raise exception 'invalid_action' using errcode = 'PT422';
end;
$$;
revoke all on function public.finish_photo_cleanup_item(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.finish_photo_cleanup_item(uuid, text, boolean) to service_role;
