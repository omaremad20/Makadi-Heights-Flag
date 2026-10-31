-- =============================================================================
-- Stage 2 — admin editing: server-stamped audit fields, revision history,
--           and the "re-review" rule for approved applications.
--
-- Non-breaking for the current frontend (status updates keep working; the
-- audit columns are now stamped by the database instead of trusted from the
-- client, which they never were in practice).
--
-- ⚠ The re-review rule (section 3) is a PROPOSAL awaiting Omar's approval.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. When did the status last change? (needed for the 30-day retention rule)
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists status_updated_at timestamptz;

comment on column public.applications.status_updated_at is
  'Set by the database whenever status changes (explicitly or by the re-review rule).';

-- ---------------------------------------------------------------------------
-- 2. Revision history (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.application_revisions (
  id                        bigint generated always as identity primary key,
  application_id            uuid not null references public.applications(id) on delete restrict,
  changed_at                timestamptz not null default now(),
  changed_by                uuid references public.profiles(id) on delete set null,
  changed_by_email_snapshot text,
  changed_fields            text[] not null check (cardinality(changed_fields) > 0),
  old_values                jsonb not null,
  new_values                jsonb not null,
  status_reset_for_review   boolean not null default false
);

comment on table public.application_revisions is
  'Append-only history of changes to applications (and photo replacements). Written only by SECURITY DEFINER triggers/functions; no role can update or delete rows.';

create index if not exists application_revisions_application_idx
  on public.application_revisions (application_id, changed_at desc);
create index if not exists application_revisions_changed_by_idx
  on public.application_revisions (changed_by);

alter table public.application_revisions enable row level security;

revoke all on public.application_revisions from public, anon, authenticated;
grant select on public.application_revisions to authenticated;

drop policy if exists application_revisions_admin_select on public.application_revisions;
create policy application_revisions_admin_select on public.application_revisions
  as permissive for select to authenticated
  using ((select public.is_active_approved_admin()));

-- Belt and braces: even roles that bypass RLS cannot rewrite history through
-- normal DML. (An operator would have to drop this trigger deliberately.)
create or replace function public.application_revisions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'application_revisions is append-only' using errcode = '42501';
end;
$$;
revoke all on function public.application_revisions_immutable() from public, anon, authenticated;

drop trigger if exists application_revisions_no_update_delete on public.application_revisions;
create trigger application_revisions_no_update_delete
  before update or delete on public.application_revisions
  for each row execute function public.application_revisions_immutable();

drop trigger if exists application_revisions_no_truncate on public.application_revisions;
create trigger application_revisions_no_truncate
  before truncate on public.application_revisions
  for each statement execute function public.application_revisions_immutable();

-- ---------------------------------------------------------------------------
-- 3. Re-review rule (PROPOSAL — see the review notes)
--    An APPROVED application goes back to 'pending' when an edit changes
--    something that affects eligibility or price:
--      period, membership_type, user_type, unit_number,
--      number of people, adding/removing the partner,
--      adding/removing an additional person.
--    Corrections that keep status: name spelling, mobile, email,
--    nationality, relative.
-- ---------------------------------------------------------------------------
create or replace function public.app_person_ids(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}')
  from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) as t(e)
$$;
revoke all on function public.app_person_ids(jsonb) from public, anon, authenticated;

create or replace function public.app_requires_rereview(o public.applications, n public.applications)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select o.period is distinct from n.period
      or o.membership_type is distinct from n.membership_type
      or o.user_type is distinct from n.user_type
      or o.unit_number is distinct from n.unit_number
      or o.persons_count is distinct from n.persons_count
      or (o.partner_name is null) <> (n.partner_name is null)
      or public.app_person_ids(o.additional_persons) is distinct from public.app_person_ids(n.additional_persons)
$$;
revoke all on function public.app_requires_rereview(public.applications, public.applications) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. BEFORE UPDATE: immutables, audit stamping, persons_count, re-review
--    Replaces applications_set_updated_at (which only set updated_at).
-- ---------------------------------------------------------------------------
create or replace function public.applications_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
    v_email := coalesce(v_email, '');
  end if;

  -- identity and creation data never change
  new.id                        := old.id;
  new.created_at                := old.created_at;
  new.idempotency_key           := old.idempotency_key;
  new.created_by                := old.created_by;
  new.created_by_email_snapshot := old.created_by_email_snapshot;
  new.updated_at                := now();

  -- headcount is derived, never typed in
  new.persons_count := coalesce(
    public.app_expected_persons_count(new.partner_name, new.additional_persons),
    new.persons_count);

  if new.status is distinct from old.status then
    -- explicit status change by the editor
    new.status_updated_at := now();
    new.status_updated_by := v_uid;
    new.status_updated_by_email_snapshot := v_email;
  elsif old.status = 'approved' and public.app_requires_rereview(old, new) then
    new.status := 'pending';
    new.status_updated_at := now();
    new.status_updated_by := v_uid;
    new.status_updated_by_email_snapshot := v_email;
  else
    new.status_updated_at := old.status_updated_at;
    new.status_updated_by := old.status_updated_by;
    new.status_updated_by_email_snapshot := old.status_updated_by_email_snapshot;
  end if;

  if v_uid is not null then
    new.last_updated_by := v_uid;
    new.last_updated_by_email_snapshot := v_email;
  else
    -- trusted backend (service role) update: keep the previous attribution
    new.last_updated_by := old.last_updated_by;
    new.last_updated_by_email_snapshot := old.last_updated_by_email_snapshot;
  end if;

  return new;
end;
$$;
revoke all on function public.applications_before_update() from public, anon, authenticated;

drop trigger if exists applications_set_updated_at_trg on public.applications;
drop function if exists public.applications_set_updated_at();

drop trigger if exists applications_before_update_trg on public.applications;
create trigger applications_before_update_trg
  before update on public.applications
  for each row execute function public.applications_before_update();

-- ---------------------------------------------------------------------------
-- 5. AFTER UPDATE: write one revision row per real change
-- ---------------------------------------------------------------------------
create or replace function public.applications_log_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols constant text[] := array[
    'period','membership_type','user_type','full_name','unit_number','mobile','email',
    'nationality','partner_name','partner_nationality','partner_mobile','partner_email',
    'additional_persons','persons_count','status'];
  v_old    jsonb := to_jsonb(old);
  v_new    jsonb := to_jsonb(new);
  v_fields text[];
  v_before jsonb;
  v_after  jsonb;
  v_uid    uuid := auth.uid();
  v_email  text;
begin
  select array_agg(k order by k),
         jsonb_object_agg(k, v_old -> k),
         jsonb_object_agg(k, v_new -> k)
    into v_fields, v_before, v_after
    from unnest(v_cols) as k
   where (v_old -> k) is distinct from (v_new -> k);

  if v_fields is null then
    return null;
  end if;

  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

  insert into public.application_revisions (
    application_id, changed_by, changed_by_email_snapshot,
    changed_fields, old_values, new_values, status_reset_for_review)
  values (
    new.id, v_uid, v_email, v_fields, v_before, v_after,
    old.status = 'approved' and new.status = 'pending' and public.app_requires_rereview(old, new));

  return null;
end;
$$;
revoke all on function public.applications_log_revision() from public, anon, authenticated;

drop trigger if exists applications_log_revision_trg on public.applications;
create trigger applications_log_revision_trg
  after update on public.applications
  for each row execute function public.applications_log_revision();

-- ---------------------------------------------------------------------------
-- 6. Admins may only write business fields; audit columns are database-owned.
--    (RLS still limits UPDATE to is_active_approved_admin().)
-- ---------------------------------------------------------------------------
revoke update on public.applications from anon, authenticated;
do $$
declare c text;
begin
  for c in
    select a.attname from pg_attribute a
    where a.attrelid = 'public.applications'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke update (%I) on public.applications from anon, authenticated', c);
  end loop;
end $$;

grant update (
  period, membership_type, user_type, full_name, unit_number, mobile, email, nationality,
  partner_name, partner_nationality, partner_mobile, partner_email,
  additional_persons, status
) on public.applications to authenticated;

-- Dashboard filters/sorting
create index if not exists applications_created_at_idx on public.applications (created_at desc);
create index if not exists applications_status_created_at_idx on public.applications (status, created_at desc);
