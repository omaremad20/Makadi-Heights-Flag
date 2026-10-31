-- =====================================================================
-- applications: drop date_of_birth, optional contact/nationality,
-- membership_type restriction, persons_count, optional additional-person
-- fields, RLS/grant hardening. Backend only.
-- =====================================================================

-- 0. Preflight: abort (do not coerce data) if existing rows block the change
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.applications where membership_type = 'beach_only';
  if v_bad > 0 then raise exception 'preflight: % row(s) have membership_type=beach_only; resolve manually', v_bad; end if;

  select count(*) into v_bad from public.applications
   where membership_type is not null and membership_type not in ('clubhouse_and_beach','clubhouse_only');
  if v_bad > 0 then raise exception 'preflight: % row(s) have unsupported membership_type', v_bad; end if;

  select count(*) into v_bad from public.applications
   where additional_persons is not null and jsonb_typeof(additional_persons) <> 'array';
  if v_bad > 0 then raise exception 'preflight: % row(s) have non-array additional_persons', v_bad; end if;

  select count(*) into v_bad from public.applications
   where partner_name is null
     and (partner_nationality is not null or partner_mobile is not null or partner_email is not null);
  if v_bad > 0 then raise exception 'preflight: % row(s) have partner contact data but no partner_name', v_bad; end if;
end $$;

-- 1. Helper: expected headcount. Returns NULL for a non-array JSONB so callers
--    can reject it explicitly (avoids three-valued-logic bypass in CHECKs).
create or replace function public.app_expected_persons_count(p_partner_name text, p_additional_persons jsonb)
returns integer
language sql
immutable parallel safe
set search_path = ''
as $$
  select case
    when p_additional_persons is null
      then 1 + (p_partner_name is not null)::int
    when jsonb_typeof(p_additional_persons) = 'array'
      then 1 + (p_partner_name is not null)::int + jsonb_array_length(p_additional_persons)
    else null
  end
$$;
revoke all on function public.app_expected_persons_count(text, jsonb) from public;
grant execute on function public.app_expected_persons_count(text, jsonb) to anon, authenticated, service_role;

-- 2. additional_persons validator: `relative` and `mobile` optional, validated when present.
--    Empty array remains invalid (NULL means "none"), max 20 enforced by existing bound constraint.
create or replace function public.app_valid_additional_persons(j jsonb)
returns boolean
language sql
immutable parallel safe
set search_path = ''
as $$
  select case
    when j is null then true
    when jsonb_typeof(j) <> 'array' then false
    when jsonb_array_length(j) = 0 then false
    else coalesce((
      select bool_and(coalesce(
        case when jsonb_typeof(e) <> 'object' then false else
          not exists (select 1 from jsonb_object_keys(e) k
                      where k not in ('name', 'relative', 'mobile'))
          and jsonb_typeof(e -> 'name') = 'string'
          and public.app_is_person_name2(e ->> 'name')
          and (not (e ? 'relative')
               or (jsonb_typeof(e -> 'relative') = 'string'
                   and (e ->> 'relative') = btrim(e ->> 'relative')
                   and char_length(e ->> 'relative') between 3 and 32
                   and (e ->> 'relative') !~ '[[:cntrl:]]'))
          and (not (e ? 'mobile')
               or (jsonb_typeof(e -> 'mobile') = 'string'
                   and public.app_is_e164_shape(e ->> 'mobile')))
        end, false))
      from jsonb_array_elements(j) as t(e)
    ), false)
  end
$$;

-- 3. RPC normalizer: a blank `relative` is dropped (like blank `mobile`) instead of stored as ''.
create or replace function public.app_normalize_person(e jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb := e;
begin
  if jsonb_typeof(e) <> 'object' then
    return e;
  end if;
  if jsonb_typeof(r -> 'name') = 'string' then
    r := jsonb_set(r, '{name}', to_jsonb(btrim(regexp_replace(r ->> 'name', '\s+', ' ', 'g'))));
  end if;
  if jsonb_typeof(r -> 'relative') = 'string' then
    if btrim(regexp_replace(r ->> 'relative', '\s+', ' ', 'g')) = '' then
      r := r - 'relative';
    else
      r := jsonb_set(r, '{relative}', to_jsonb(btrim(regexp_replace(r ->> 'relative', '\s+', ' ', 'g'))));
    end if;
  end if;
  if jsonb_typeof(r -> 'mobile') = 'string' then
    if btrim(regexp_replace(r ->> 'mobile', '^\s+|\s+$', '', 'g')) = '' then
      r := r - 'mobile';
    else
      r := jsonb_set(r, '{mobile}', to_jsonb(regexp_replace(r ->> 'mobile', '^\s+|\s+$', '', 'g')));
    end if;
  end if;
  return r;
end;
$$;

-- 4. Remove date_of_birth (no CASCADE: fails loudly if something unexpected depends on it)
alter table public.applications drop constraint if exists applications_dob_chk;
alter table public.applications drop column date_of_birth;

-- 5. Nullable nationality / mobile / email, validation preserved for non-NULL values
alter table public.applications
  alter column nationality drop not null,
  alter column mobile drop not null,
  alter column email drop not null;

alter table public.applications
  drop constraint if exists applications_nationality_chk,
  drop constraint if exists applications_mobile_chk,
  drop constraint if exists applications_email_chk;

alter table public.applications
  add constraint applications_nationality_chk check (
    nationality is null or (
      nationality = btrim(nationality)
      and char_length(nationality) between 1 and 64
      and nationality !~ '[[:cntrl:]]')),
  add constraint applications_mobile_chk check (
    mobile is null or public.app_is_e164_shape(mobile)),
  add constraint applications_email_chk check (
    email is null or (
      email = btrim(email)
      and char_length(email) between 5 and 254
      and email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:].]+(\.[^@[:space:][:cntrl:].]+)+$'));

-- 6. membership_type: only the two supported values (NULL still allowed: existing workflow/rows use it)
alter table public.applications drop constraint if exists applications_membership_type_chk;
alter table public.applications
  add constraint applications_membership_type_chk
  check (membership_type is null or membership_type in ('clubhouse_and_beach', 'clubhouse_only'));

-- 7. Partner: contact data only makes sense with a named partner (partner_name stays the only required field)
alter table public.applications drop constraint if exists applications_partner_requires_name_chk;
alter table public.applications
  add constraint applications_partner_requires_name_chk
  check (partner_name is not null
         or (partner_nationality is null and partner_mobile is null and partner_email is null));

-- 8. persons_count: add nullable, backfill from stored data, then enforce
alter table public.applications add column persons_count integer;

alter table public.applications disable trigger applications_set_updated_at_trg;  -- keep updated_at untouched by backfill
update public.applications
   set persons_count = public.app_expected_persons_count(partner_name, additional_persons)
 where persons_count is null;
alter table public.applications enable trigger applications_set_updated_at_trg;

do $$
begin
  if exists (select 1 from public.applications where persons_count is null or persons_count not between 1 and 22) then
    raise exception 'backfill failed: persons_count NULL or out of range for existing rows';
  end if;
end $$;

alter table public.applications alter column persons_count set not null;
alter table public.applications
  add constraint applications_persons_count_range_chk check (persons_count between 1 and 22),
  add constraint applications_persons_count_consistent_chk check (
    coalesce(persons_count = public.app_expected_persons_count(partner_name, additional_persons), false));

-- 9. submit_application RPC: no date_of_birth, optional contact fields, computes persons_count.
--    `date_of_birth` is still tolerated in the payload (ignored) so an un-updated client keeps working.
create or replace function public.submit_application(p_idempotency_key uuid, p_payload jsonb, p_ip_hash text, p_max_requests integer default 10, p_window_seconds integer default 3600)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'period','user_type','full_name','unit_number','date_of_birth','mobile','email',
    'nationality','partner_name','partner_nationality','partner_mobile','partner_email',
    'additional_persons','persons_count'];
  v_key        text;
  v_period     public.application_period;
  v_user_type  public.application_user_type;
  v_full_name  text;
  v_unit       text;
  v_mobile     text;
  v_email      text;
  v_nat        text;
  v_p_name     text;
  v_p_nat      text;
  v_p_mobile   text;
  v_p_email    text;
  v_ap         jsonb;
  v_pc_raw     jsonb;
  v_headcount  integer;
  v_window     timestamptz;
  v_count      integer;
  v_row        public.applications;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'PT422';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object' using errcode = 'PT422';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_client_key' using errcode = 'PT422';
  end if;
  if p_max_requests is null or p_max_requests < 1
     or p_window_seconds is null or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = 'PT422';
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown_field' using errcode = 'PT422', detail = v_key;
    end if;
  end loop;

  begin
    v_period := coalesce(public.app_payload_text(p_payload, 'period'), 'week')::public.application_period;
  exception when invalid_text_representation then
    raise exception 'invalid_period' using errcode = 'PT422';
  end;
  begin
    v_user_type := public.app_payload_text(p_payload, 'user_type')::public.application_user_type;
  exception when invalid_text_representation then
    raise exception 'invalid_user_type' using errcode = 'PT422';
  end;

  v_full_name := public.app_payload_text(p_payload, 'full_name', true);
  v_unit      := public.app_payload_text(p_payload, 'unit_number');
  v_mobile    := public.app_payload_text(p_payload, 'mobile');
  v_email     := public.app_payload_text(p_payload, 'email');
  v_nat       := public.app_payload_text(p_payload, 'nationality');
  v_p_name    := public.app_payload_text(p_payload, 'partner_name', true);
  v_p_nat     := public.app_payload_text(p_payload, 'partner_nationality');
  v_p_mobile  := public.app_payload_text(p_payload, 'partner_mobile');
  v_p_email   := public.app_payload_text(p_payload, 'partner_email');

  v_ap := p_payload -> 'additional_persons';
  if v_ap is null or jsonb_typeof(v_ap) = 'null' then
    v_ap := null;
  elsif jsonb_typeof(v_ap) = 'array' then
    if jsonb_array_length(v_ap) = 0 then
      v_ap := null;
    else
      select jsonb_agg(public.app_normalize_person(e) order by ord)
        into v_ap
        from jsonb_array_elements(v_ap) with ordinality as t(e, ord);
    end if;
  end if;

  begin
    v_headcount := public.application_headcount(v_p_name, v_ap);
  exception when sqlstate '22023' then
    raise exception 'invalid_additional_persons' using errcode = 'PT422';
  end;

  v_pc_raw := p_payload -> 'persons_count';
  if v_pc_raw is not null and jsonb_typeof(v_pc_raw) <> 'null' then
    if jsonb_typeof(v_pc_raw) <> 'number' or (v_pc_raw #>> '{}') !~ '^[0-9]{1,3}$' then
      raise exception 'invalid_persons_count' using errcode = 'PT422';
    end if;
    if (v_pc_raw #>> '{}')::int <> v_headcount then
      raise exception 'persons_count_mismatch' using errcode = 'PT422';
    end if;
  end if;

  select * into v_row from public.applications where idempotency_key = p_idempotency_key;

  if not found then
    v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

    insert into public.application_submit_rate_limits as r (ip_hash, window_start, request_count)
    values (p_ip_hash, v_window, 1)
    on conflict (ip_hash, window_start)
      do update set request_count = r.request_count + 1
    returning r.request_count into v_count;

    if v_count > p_max_requests then
      raise exception 'rate_limit_exceeded' using errcode = 'PT429',
        hint = (ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now()))))::int::text;
    end if;

    if random() < 0.02 then
      delete from public.application_submit_rate_limits
       where window_start < now() - interval '2 days';
    end if;

    insert into public.applications (
      idempotency_key, period, user_type, full_name, unit_number,
      mobile, email, nationality, partner_name, partner_nationality,
      partner_mobile, partner_email, additional_persons, persons_count, status)
    values (
      p_idempotency_key, v_period, v_user_type, v_full_name, v_unit,
      v_mobile, v_email, v_nat, v_p_name, v_p_nat,
      v_p_mobile, v_p_email, v_ap, v_headcount, 'pending')
    on conflict (idempotency_key) do nothing;

    select * into v_row from public.applications where idempotency_key = p_idempotency_key;
  end if;

  if v_row.full_name is distinct from v_full_name
     or v_row.unit_number is distinct from v_unit
     or lower(v_row.email) is distinct from lower(v_email) then
    raise exception 'idempotency_key_conflict' using errcode = 'PT409';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'period', v_row.period,
    'user_type', v_row.user_type,
    'full_name', v_row.full_name,
    'unit_number', v_row.unit_number,
    'mobile', v_row.mobile,
    'email', v_row.email,
    'nationality', v_row.nationality,
    'partner_name', v_row.partner_name,
    'partner_nationality', v_row.partner_nationality,
    'partner_mobile', v_row.partner_mobile,
    'partner_email', v_row.partner_email,
    'additional_persons', v_row.additional_persons,
    'persons_count', v_row.persons_count,
    'status', v_row.status);
end;
$$;

-- 10. Privileges and RLS
-- 10a. DELETE/TRUNCATE: nobody at application level (postgres owner retains it for operators)
revoke delete, truncate on public.applications from public, anon, authenticated, service_role;

-- 10b. INSERT: public visitors (anon) and signed-in users
grant insert on public.applications to anon, authenticated;

-- 10c. UPDATE: authenticated only, column-scoped (RLS limits it further to approved active admins)
revoke update on public.applications from anon, authenticated;
grant update (
  period, user_type, full_name, unit_number, mobile, email, nationality,
  partner_name, partner_nationality, partner_mobile, partner_email,
  additional_persons, persons_count, membership_type, status,
  status_updated_by, status_updated_by_email_snapshot,
  last_updated_by, last_updated_by_email_snapshot
) on public.applications to authenticated;

alter table public.applications enable row level security;

drop policy if exists applications_public_insert on public.applications;
create policy applications_public_insert on public.applications
  as permissive for insert to anon, authenticated
  with check (
    status = 'pending'
    and status_updated_by is null
    and (created_by is null or created_by = (select auth.uid()))
    and (last_updated_by is null or last_updated_by = (select auth.uid()))
  );

-- SELECT / UPDATE policies already use is_active_approved_admin() (role='admin' AND approved AND is_active); recreate to make the migration self-contained
drop policy if exists applications_admin_select on public.applications;
create policy applications_admin_select on public.applications
  as permissive for select to authenticated
  using ((select public.is_active_approved_admin()));

drop policy if exists applications_admin_update on public.applications;
create policy applications_admin_update on public.applications
  as permissive for update to authenticated
  using ((select public.is_active_approved_admin()))
  with check ((select public.is_active_approved_admin()));

-- Defence in depth: explicit deny for DELETE on API roles
drop policy if exists applications_no_delete on public.applications;
create policy applications_no_delete on public.applications
  as restrictive for delete to anon, authenticated
  using (false);
